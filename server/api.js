// REST API: streams, leads, showings, PayPal reserve holds (property),
// PayPal webhook, and token-protected admin/Command Center endpoints.
import express from "express";
import crypto from "node:crypto";
import { config } from "./config.js";
import { db, dbDiagnostics, listStreams, getStream, audit, invalidateStreams } from "./db.js";
import * as paypal from "./paypal.js";
import { broadcast, broadcastAll, broadcastCommerce, roomSize } from "./realtime.js";
import { HOLD_TERMS, sid } from "./seed-data.js";
import { routeLead, logWhatsAppClick, isEmail as validEmail } from "./leads/router.js";
import { runDueFollowups, unsubscribeToken } from "./leads/sequence.js";
import { integrations } from "./leads/providers.js";
import { scanReddit } from "./prospects/reddit.js";
import { cloudflareEnabled, createLiveInput, getLiveInput, deleteLiveInput, hlsUrl as hlsUrlFor } from "./stream/cloudflare.js";
import { liveNow } from "./stream/monitor.js";
import { THEMES, aiEnabled, today, themeFor, generateForDate, recentPosts, ensureToday } from "./content/generator.js";
import { videoProvider, renderVideo } from "./content/video.js";
import { sendEmail } from "./leads/providers.js";

/** Every captured lead goes through the same pipeline (save → alert → CRM → follow-up). */
async function captureLead(l) {
  const r = await routeLead(l);
  return { id: r.lead_id, report: r };
}

export const api = express.Router();
api.use(express.json({ limit: "32kb" }));

// ------------------------------------------------------------------ helpers
const clean = (s, n = 200) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const publicName = (first, last) => {
  const f = clean(first, 30).split(/\s+/)[0];
  const l = clean(last, 30);
  return f ? f + (l ? ` ${l[0].toUpperCase()}.` : "") : "Someone";
};
const fail = (res, status, error) => res.status(status).json({ error });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const hits = new Map();
function rateLimit(max, windowMs = 60_000) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.route?.path || req.path}`;
    const now = Date.now();
    const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (h.length >= max) return fail(res, 429, "Too many requests — try again in a minute.");
    h.push(now); hits.set(key, h);
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60_000).unref();

function requireAdmin(req, res, next) {
  const tok = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!config.adminToken) return fail(res, 503, "Set ADMIN_TOKEN in .env to enable admin endpoints.");
  const a = Buffer.from(tok), b = Buffer.from(config.adminToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail(res, 401, "Unauthorized");
  next();
}

function paymentsAvailable(res) {
  if (config.paypal.mode === "mock" && process.env.NODE_ENV === "production") {
    fail(res, 503, "Payments are not configured (PAYPAL_CLIENT_ID / PAYPAL_SECRET).");
    return false;
  }
  return true;
}

const withViewers = (s) => ({ ...s, viewers: roomSize(s.id) + (config.demoMode ? s.baselineViewers : 0), liveNow: liveNow(s) });

// ---------------------------------------------------------------- Cloudflare Stream hosts
// Each agent gets a private host link (/go-live/#t=<token>) showing their stream key. Only a
// SHA-256 hash of the token is stored; the stream key itself stays at Cloudflare.
const sha256 = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const hostLink = (token) => `${config.appUrl}/go-live/#t=${token}`;

async function issueHostToken(stream) {
  const token = crypto.randomBytes(24).toString("base64url");
  await db.update("streams", { id: stream.id }, { meta: { ...(stream.meta || {}), host_token_hash: sha256(token) } });
  return token;
}

/** Gives an approved agent their own Cloudflare live input and emails them the host link. */
async function provisionCloudflare(stream) {
  if (!cloudflareEnabled() || stream.meta?.cf_input_uid || stream.playback_url) return null;
  const input = await createLiveInput({ name: `${stream.meta?.host_name || "Agent"} — ${stream.meta?.title || ""}`, streamId: stream.id });
  const meta = { ...(stream.meta || {}), cf_input_uid: input.uid };
  await db.update("streams", { id: stream.id }, { provider: "cloudflare", playback_url: input.hls, meta });
  const token = await issueHostToken({ ...stream, meta });
  invalidateStreams();
  const link = hostLink(token);
  if (stream.meta?.host_email) {
    const first = String(stream.meta.host_name || "").split(/\s+/)[0] || "there";
    await sendEmail({
      to: stream.meta.host_email,
      subject: "You're approved to go live on Bridges Live",
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;max-width:560px"><p>Hi ${first.replace(/[<>&"]/g, "")},</p>
<p>Your stream <b>${String(stream.meta.title || "").replace(/[<>&"]/g, "")}</b> is ready. Open your private Go-Live page for your stream key and step-by-step setup (phone or OBS):</p>
<p><a href="${link}" style="display:inline-block;background:#1A5C3A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Open my Go-Live page</a></p>
<p style="font-size:13px;color:#555">Keep this link private — anyone with it can see your stream key.</p><p>— Bridges Live</p></div>`,
      text: `Your Bridges Live stream is ready. Open your private Go-Live page (keep it private): ${link}`,
    }).catch((e) => console.warn("[host email]", e.message));
  }
  await audit("stream.cloudflare_provisioned", "streams", stream.id, { uid: input.uid });
  return link;
}

async function streamByHostToken(req) {
  const tok = String(req.get("x-host-token") || "").trim();
  if (tok.length < 20) return null;
  const h = sha256(tok);
  const rows = await db.select("streams", { provider: "cloudflare" }).catch(() => []);
  return rows.find((s) => s.meta?.host_token_hash && s.meta.host_token_hash.length === h.length && crypto.timingSafeEqual(Buffer.from(s.meta.host_token_hash), Buffer.from(h))) || null;
}

// ------------------------------------------------------------------ config
api.get("/config", (req, res) => {
  res.json({
    paypal: { mode: config.paypal.mode, clientId: config.paypal.mode === "mock" ? null : config.paypal.clientId, currency: "USD" },
    holds: { enabled: config.holdsEnabled, ...HOLD_TERMS },
    demoMode: config.demoMode,
    database: db.kind,
  });
});

api.get("/health", (req, res) => res.json({
  ok: true, database: db.kind, paypal: config.paypal.mode,
  video: cloudflareEnabled() ? "cloudflare" : `off — missing ${[!config.cloudflare.accountId && "CF_ACCOUNT_ID", !config.cloudflare.token && "CF_STREAM_TOKEN", !config.cloudflare.customerCode && "CF_SUBDOMAIN"].filter(Boolean).join(", ")}`,
  database_detail: dbDiagnostics.reason,
  supabase_project: config.supabase.url ? new URL(config.supabase.url).hostname.split(".")[0] : null,
  supabase_key_type: !config.supabase.serviceKey ? null : config.supabase.serviceKey.startsWith("sb_secret_") ? "secret" : config.supabase.serviceKey.startsWith("sb_publishable_") ? "publishable (WRONG — use the secret key)" : config.supabase.serviceKey.startsWith("eyJ") ? "legacy JWT" : "unknown",
}));

// ------------------------------------------------------------------ streams
api.get("/streams", wrap(async (req, res) => {
  const cat = clean(req.query.category, 20);
  const rows = (await listStreams())
    .filter((s) => !cat || cat === "all" || s.category === cat)
    .filter((s) => config.showSeedStreams || s.applicant || s.owner)
    .map(withViewers);
  // agents broadcasting right now first (stable otherwise)
  rows.sort((a, b) => (b.liveNow === true) - (a.liveNow === true));
  res.json({ streams: rows });
}));

api.get("/streams/:id", wrap(async (req, res) => {
  const s = await getStream(req.params.id);
  if (!s) return fail(res, 404, "Stream not found");
  res.json(withViewers(s));
}));

api.get("/streams/:id/product", wrap(async (req, res) => {
  const s = await getStream(req.params.id);
  if (!s) return fail(res, 404, "Stream not found");
  res.json({
    streamId: s.id, title: s.showTitle || s.title,
    product: { id: s.listingId, name: s.title, priceLabel: s.priceLabel, hold: config.holdsEnabled ? s.hold : null },
    cta: { label: "Request a showing", action: "showing" },
    viewers: withViewers(s).viewers, live: true,
  });
}));

function playbackProvider(url) {
  if (!url) return null;
  if (/^https:\/\/([\w-]+\.)*(youtube\.com|youtu\.be)\//.test(url)) return "youtube";
  if (/^https:\/\/([\w-]+\.)*tiktok\.com\//.test(url)) return "tiktok";
  if (/^https:\/\/([\w-]+\.)*(facebook\.com|fb\.watch)\//.test(url)) return "facebook";
  if (/\.m3u8(\?|$)/.test(url)) return "hls";
  if (/\.(mp4|webm)(\?|$)/.test(url)) return "file";
  return null;
}

// "Go Live" — a verified host registers a stream (YouTube Live / HLS from Cloudflare Stream or IVS).
api.post("/streams", rateLimit(5), wrap(async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), title = clean(b.title, 120);
  const playbackUrl = clean(b.playbackUrl, 500);
  const provider = playbackProvider(playbackUrl);
  if (!name || !isEmail(email) || !title) return fail(res, 400, "Name, a valid email and a stream title are required.");
  if (playbackUrl && (!/^https:\/\//.test(playbackUrl) || !provider)) return fail(res, 400, "Video link must be an https YouTube, TikTok or Facebook live link, or an .m3u8/.mp4 stream.");
  const category = ["new", "apt", "lux", "reloc", "tx"].includes(b.category) ? b.category : "new";
  const labels = { new: "New Construction", apt: "Apartments", lux: "Luxury", reloc: "Relocation", tx: "Texas" };
  const verticals = await db.select("verticals", { slug: "real-estate" });
  const verticalId = verticals[0]?.id || null;

  const lead = await captureLead({
    first_name: name, email, phone: clean(b.phone, 40), market: title, source: "Website — Go Live (streamer application)",
    notes: `License: ${clean(b.license, 60) || "n/a"} · Brokerage: ${clean(b.brokerage, 80) || "n/a"} · Stream: ${playbackUrl || "not yet"}`,
  });
  const org = await db.insert("organizations", { name: clean(b.brokerage, 80) || name, vertical_id: verticalId, plan: "agent", sponsoring_broker: clean(b.brokerage, 80) || null });
  const listing = await db.insert("listings", {
    org_id: org.id, vertical_id: verticalId, title, status: "active",
    attributes: { kind: "property", price_label: clean(b.priceLabel, 40), location: clean(b.location, 80), image: null, hold: HOLD_TERMS },
  });
  const status = config.autoApproveStreams ? "live" : "pending_review";
  const show = await db.insert("shows", { org_id: org.id, vertical_id: verticalId, title, category, status: status === "live" ? "live" : "scheduled" });
  await db.insert("show_listings", { show_id: show.id, listing_id: listing.id });
  const stream = await db.insert("streams", {
    show_id: show.id, provider: provider || "youtube", playback_url: playbackUrl || null, status,
    room_id: `room-${crypto.randomBytes(4).toString("hex")}`, viewer_count: 0,
    meta: { host_name: name, category, category_label: labels[category], likes: 0, cta: "showing", host_email: email, host_phone: clean(b.phone, 40), license: clean(b.license, 60), brokerage: clean(b.brokerage, 80), title, applicant: true },
  });
  invalidateStreams();
  await audit("stream.created", "streams", stream.id, { email, status, lead: lead?.id });
  let hostUrl = null;
  if (status === "live") hostUrl = await provisionCloudflare(stream).catch((e) => { console.warn("[cloudflare]", e.message); return null; });
  res.status(201).json({ streamId: stream.id, status, watchUrl: `/live-marketplace?stream=${stream.id}`, hostUrl });
}));

api.post("/streams/:id/stop", requireAdmin, wrap(async (req, res) => {
  const rows = await db.update("streams", { id: req.params.id }, { status: "ended" });
  if (!rows.length) return fail(res, 404, "Stream not found");
  invalidateStreams();
  broadcast(req.params.id, { type: "stream_status", status: "ended" });
  res.json({ ok: true });
}));

api.post("/admin/streams/:id/approve", requireAdmin, wrap(async (req, res) => {
  const rows = await db.update("streams", { id: req.params.id }, { status: "live" });
  if (!rows.length) return fail(res, 404, "Stream not found");
  invalidateStreams();
  let hostUrl = null;
  try { hostUrl = await provisionCloudflare(rows[0]); } catch (e) { return fail(res, 502, `Approved, but Cloudflare Stream setup failed: ${e.message}`); }
  await audit("stream.approved", "streams", req.params.id);
  res.json({ ok: true, hostUrl });
}));

// ------------------------------------------------------------------ leads + showings
api.post("/leads", rateLimit(10), wrap(async (req, res) => {
  const b = req.body || {};
  const email = clean(b.email, 120).toLowerCase();
  if (!clean(b.first_name || b.name) || !isEmail(email)) return fail(res, 400, "Name and a valid email are required.");
  const lead = await captureLead({
    first_name: clean(b.first_name || b.name, 80), email, phone: clean(b.phone, 40), market: clean(b.market, 120),
    source: clean(b.source, 120) || "Website", notes: clean(b.notes, 2000), stage: "New", priority: "High",
    stream_id: clean(b.streamId, 64) || null,
  });
  res.status(201).json({ ok: true, id: lead?.id ?? null, delivery: lead.report });
}));

// ---------------------------------------------------------------- lead router (all site forms)
// Public endpoint every lead form posts to. Honeypot + rate limit keep bots from texting your phone.
api.post("/lead-router", rateLimit(8, 10 * 60_000), wrap(async (req, res) => {
  const b = req.body || {};
  if (b.company_website) return res.status(201).json({ ok: true }); // honeypot field filled → bot; pretend success
  const email = clean(b.email, 120).toLowerCase();
  if (!clean(b.first_name || b.name) || !(validEmail(email) || /\d{7,}/.test(String(b.phone || "").replace(/\D/g, "")))) {
    return fail(res, 400, "Please add your name and an email or phone number.");
  }
  const r = await routeLead({
    first_name: b.first_name || b.name, email, phone: b.phone, market: b.market, source: b.source, notes: b.notes,
    page_url: b.page_url, utm: b.utm, sms_consent: b.sms_consent === true, stream_id: clean(b.streamId, 64) || null,
  });
  res.status(201).json({ ok: true, id: r.lead_id, delivery: r });
}));

// "Message us on WhatsApp" taps → anonymous lead + email alert (sent with navigator.sendBeacon)
api.post("/whatsapp-click", express.text({ type: "*/*", limit: "8kb" }), rateLimit(20, 10 * 60_000), wrap(async (req, res) => {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  if (!b || typeof b !== "object" || b.company_website) return res.status(204).end();
  const r = await logWhatsAppClick({ page_url: b.page_url, label: b.label, stream_title: b.stream_title, utm: b.utm, visitor: b.visitor || req.ip });
  res.status(201).json({ ok: true, ...r });
}));

// ---------------------------------------------------------------- agent Go-Live page API
api.get("/host/stream", rateLimit(30), wrap(async (req, res) => {
  const s0 = await streamByHostToken(req);
  if (!s0) return fail(res, 401, "This Go-Live link is invalid or was replaced. Ask Bridges for a new one.");
  let input = null, error = null;
  try { input = await getLiveInput(s0.meta.cf_input_uid); } catch (e) { error = e.message; }
  const pub = await getStream(s0.id);
  res.json({
    streamId: s0.id, title: s0.meta?.title || pub?.title, host: s0.meta?.host_name, status: s0.status,
    liveNow: pub ? liveNow(pub) : false, watchUrl: `${config.appUrl}/live-marketplace?stream=${s0.id}`,
    ingest: input && { rtmpsUrl: input.rtmpsUrl, streamKey: input.streamKey, srtUrl: input.srtUrl, srtStreamId: input.srtStreamId, srtPassphrase: input.srtPassphrase, state: input.state },
    error,
  });
}));

api.get("/unsubscribe", wrap(async (req, res) => {
  let email = "";
  try { email = Buffer.from(String(req.query.e || ""), "base64url").toString("utf8").toLowerCase(); } catch {}
  const ok = validEmail(email) && String(req.query.t || "") === unsubscribeToken(email);
  if (ok) {
    if (!(await db.select("lead_unsubscribes", { email })).length) await db.insert("lead_unsubscribes", { email });
    await db.update("lead_followups", { email, status: "pending" }, { status: "cancelled", detail: "unsubscribed" });
  }
  res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font-family:Arial,sans-serif;max-width:520px;margin:60px auto;padding:0 16px;color:#1A1A1A"><h2 style="color:#0E1E52">${ok ? "You're unsubscribed" : "Link not valid"}</h2><p>${ok ? "You won't receive any more automatic emails from Bridges Global." : "This unsubscribe link is invalid or expired. Reply to any email and we'll remove you."}</p><p><a href="/">Back to Bridges Global</a></p></body>`);
}));
api.post("/unsubscribe", wrap(async (req, res) => { // RFC 8058 one-click (List-Unsubscribe-Post)
  let email = "";
  try { email = Buffer.from(String(req.query.e || ""), "base64url").toString("utf8").toLowerCase(); } catch {}
  if (validEmail(email) && String(req.query.t || "") === unsubscribeToken(email)) {
    if (!(await db.select("lead_unsubscribes", { email })).length) await db.insert("lead_unsubscribes", { email });
    await db.update("lead_followups", { email, status: "pending" }, { status: "cancelled", detail: "unsubscribed" });
  }
  res.status(200).end();
}));

// External free cron (cron-job.org) pings this every 15 min: sends due follow-ups and keeps a
// free Render instance awake. Authorization: Bearer $CRON_SECRET
api.post("/cron/followups", wrap(async (req, res) => {
  const tok = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(tok), b2 = Buffer.from(config.cronSecret || "");
  if (!config.cronSecret || a.length !== b2.length || !crypto.timingSafeEqual(a, b2)) return fail(res, 401, "Unauthorized");
  const followups = await runDueFollowups();
  let content = null;
  try { const p = await ensureToday(sendEmail); content = p ? { date: p.post_date, source: p.source, emailed: !!p.emailed_at } : null; }
  catch (e) { content = { error: e.message }; }
  res.json({ ...followups, content });
}));

api.post("/showings", rateLimit(8), wrap(async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase();
  if (!name || !isEmail(email)) return fail(res, 400, "Name and a valid email are required.");
  const s = await getStream(clean(b.streamId, 64));
  if (!s) return fail(res, 404, "Stream not found");
  const eng = await db.insert("engagements", { show_id: s.showId, type: "showing_request" });
  const lead = await captureLead({
    first_name: name, email, phone: clean(b.phone, 40), market: s.title, source: "Bridges Live — Request a showing",
    notes: `Live stream: ${s.title} (${s.host}). Preferred time: ${clean(b.when, 80) || "flexible"}. ${clean(b.message, 800)}`,
    listing_id: s.listingId, org_id: s.orgId, host_id: s.hostId, stream_id: s.id, engagement_id: eng.id,
  });
  try {
    const when = Date.parse(b.when);
    await db.insert("appointments", { lead_id: lead.id, status: "requested", scheduled_at: Number.isNaN(when) ? null : new Date(when).toISOString() });
  } catch (e) { console.warn("[appointments]", e.message); }
  const evt = { type: "showing_requested", streamId: s.id, name: publicName(name), title: s.title, ts: new Date().toISOString() };
  broadcastCommerce(s.id, evt);
  res.status(201).json({ ok: true });
}));

async function orderByProviderId(id) {
  return (await db.select("orders", { provider: "paypal", provider_order_id: clean(id, 64) }))[0] || null;
}

// ------------------------------------------------------------------ property: Reserve hold (PayPal AUTHORIZE)
api.post("/holds", rateLimit(6), wrap(async (req, res) => {
  if (!config.holdsEnabled) return fail(res, 403, "Reserve holds are not enabled — please request a showing instead.");
  if (!paymentsAvailable(res)) return;
  const b = req.body || {};
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase();
  if (!name || !isEmail(email)) return fail(res, 400, "Name and a valid email are required.");
  if (b.agree !== true) return fail(res, 400, "Please confirm the hold terms.");
  const s = await getStream(clean(b.streamId, 64));
  if (!s) return fail(res, 400, "This stream has no property to hold.");
  const lead = await captureLead({
    first_name: name, email, phone: clean(b.phone, 40), market: s.title, source: "Bridges Live — Reserve hold",
    notes: `Requested ${HOLD_TERMS.label} on ${s.title} (${s.host}) during live stream.`,
    listing_id: s.listingId, org_id: s.orgId, host_id: s.hostId, stream_id: s.id,
  });
  const localId = crypto.randomUUID();
  const items = [{ name: `Refundable reservation hold — ${s.title}`, price: HOLD_TERMS.amount, qty: 1 }];
  const order = await paypal.createOrder({ intent: "AUTHORIZE", currency: HOLD_TERMS.currency, items, description: `Refundable hold: ${s.title}`, customId: localId });
  await db.insert("orders", {
    id: localId, org_id: s.orgId, kind: "hold", provider: "paypal", provider_order_id: order.id, status: "pending",
    currency: HOLD_TERMS.currency.toLowerCase(), amount: HOLD_TERMS.amount, items, stream_id: s.id, listing_id: s.listingId,
    buyer_name: name, buyer_email: email, buyer_phone: clean(b.phone, 40) || null, lead_ref: lead?.id != null ? String(lead.id) : null,
    meta: { paypal_mode: config.paypal.mode, terms: "Authorization only — never captured automatically; voided on request or after review." },
  });
  res.status(201).json({ orderId: order.id, amount: HOLD_TERMS.amount, currency: HOLD_TERMS.currency, mode: config.paypal.mode });
}));

api.post("/holds/:orderId/authorize", rateLimit(20), wrap(async (req, res) => {
  const order = await orderByProviderId(req.params.orderId);
  if (!order || order.kind !== "hold") return fail(res, 404, "Hold not found");
  if (order.status === "authorized") return res.json({ ok: true, status: "authorized" });
  const auth = await paypal.authorizeOrder(order.provider_order_id);
  if (auth.status !== "COMPLETED" || !auth.authorizationId) {
    await db.update("orders", { id: order.id }, { status: "failed", meta: { ...order.meta, paypal_status: auth.status } });
    return fail(res, 402, `Hold not authorized (${auth.status}).`);
  }
  await db.update("orders", { id: order.id }, {
    status: "authorized", provider_capture_id: auth.authorizationId, updated_at: new Date().toISOString(),
    meta: { ...order.meta, authorization_expires: auth.expires || null },
  });
  const title = (order.items?.[0]?.name || "").replace(/^Refundable reservation hold — /, "");
  broadcastCommerce(order.stream_id, { type: "hold_reserved", streamId: order.stream_id, buyerFirst: publicName(order.buyer_name), title, amount: Number(order.amount), ts: new Date().toISOString() });
  await audit("hold.authorized", "orders", order.id, { provider_order_id: order.provider_order_id });
  res.json({ ok: true, status: "authorized" });
}));

// ------------------------------------------------------------------ PayPal webhook (backup confirmation)
api.post("/paypal/webhook", wrap(async (req, res) => {
  const evt = req.body || {};
  const ok = await paypal.verifyWebhook(req.headers, evt).catch((e) => { console.warn("[webhook verify]", e.message); return false; });
  if (!ok) return fail(res, 400, "Webhook signature not verified");
  const r = evt.resource || {};
  const orderId = r.supplementary_data?.related_ids?.order_id || (evt.event_type === "CHECKOUT.ORDER.APPROVED" ? r.id : null);
  const order = orderId ? await orderByProviderId(orderId) : null;
  if (order) {
    if (evt.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      await db.update("orders", { id: order.id }, { status: "refunded" });
    } else if (evt.event_type === "PAYMENT.AUTHORIZATION.VOIDED") {
      await db.update("orders", { id: order.id }, { status: "voided" });
    }
    await audit(`paypal.${evt.event_type}`, "orders", order.id, { event_id: evt.id });
  }
  res.json({ received: true });
}));

// ------------------------------------------------------------------ admin / Command Center
const admin = express.Router();
admin.use(requireAdmin);

admin.get("/summary", wrap(async (req, res) => {
  const [orders, leads, comments] = await Promise.all([
    db.select("orders", {}, { order: "created_at", limit: 500 }),
    db.select("leads", {}, { order: "created_at", limit: 500 }),
    db.select("comment_events", {}, { order: "created_at", limit: 500 }),
  ]);
  const paid = orders.filter((o) => o.kind === "purchase" && o.status === "paid");
  res.json({
    database: db.kind, paypal: config.paypal.mode,
    revenue: paid.reduce((s, o) => s + Number(o.amount || 0), 0), purchases: paid.length,
    holds: { authorized: orders.filter((o) => o.kind === "hold" && o.status === "authorized").length, voided: orders.filter((o) => o.kind === "hold" && o.status === "voided").length },
    leads: leads.length, comments: comments.length,
    intents: comments.reduce((m, c) => ((m[c.intent] = (m[c.intent] || 0) + 1), m), {}),
    flagged: comments.filter((c) => c.moderation !== "visible").length,
  });
}));
// ------------------------------------------------------------------ "Start My Live" (owner channel)
// One permanent stream for the site owner. Either a Cloudflare live input (stream from the phone
// with Larix/OBS — same key every time) or a pasted YouTube / TikTok / Facebook live link.
const OWNER = { stream: sid("stream:owner"), show: sid("show:owner"), listing: sid("listing:owner"), org: sid("org:Bridges Global") };
const CATEGORY_LABELS = { new: "New Construction", apt: "Apartments", lux: "Luxury", reloc: "Relocation", tx: "Texas" };

async function ownerState() {
  const st = (await db.select("streams", { id: OWNER.stream }))[0] || null;
  const out = { cloudflare: cloudflareEnabled(), stream: null, ingest: null };
  if (!st) return out;
  out.stream = {
    id: st.id, status: st.status, onSite: st.status === "live", provider: st.provider, playbackUrl: st.playback_url,
    title: st.meta?.title || "", location: st.meta?.location || "", priceLabel: st.meta?.price_label || "", category: st.meta?.category || "new",
    liveNow: st.status === "live" && liveNow(st), watchUrl: `/live-marketplace?stream=${st.id}`,
  };
  if (st.meta?.cf_input_uid && cloudflareEnabled()) {
    try { const i = await getLiveInput(st.meta.cf_input_uid); out.ingest = { rtmpsUrl: i.rtmpsUrl, streamKey: i.streamKey, srtUrl: i.srtUrl }; }
    catch (e) { out.ingestError = e.message; }
  }
  return out;
}

admin.get("/my-live", wrap(async (req, res) => res.json(await ownerState())));

admin.post("/my-live", wrap(async (req, res) => {
  const b = req.body || {};
  const mode = b.mode === "link" ? "link" : "cloudflare";
  const title = clean(b.title, 120) || "Live with Dorota — Tampa Bay homes";
  const category = CATEGORY_LABELS[b.category] ? b.category : "new";
  const url = clean(b.url, 500);
  const provider = mode === "link" ? playbackProvider(url) : "cloudflare";
  if (mode === "link" && (!/^https:\/\//.test(url) || !provider)) return fail(res, 400, "Paste the https link of your YouTube, TikTok or Facebook live (or an .m3u8 stream).");
  if (mode === "cloudflare" && !cloudflareEnabled()) return fail(res, 409, "Phone streaming needs Cloudflare Stream: add CF_ACCOUNT_ID, CF_STREAM_TOKEN and CF_SUBDOMAIN in Render. Meanwhile, paste a YouTube/TikTok live link instead.");

  const verticalId = (await db.select("verticals", { slug: "real-estate" }))[0]?.id || null;
  if (!(await db.select("organizations", { id: OWNER.org })).length) await db.insert("organizations", { id: OWNER.org, name: "Bridges Global", vertical_id: verticalId, plan: "brokerage", sponsoring_broker: "LPT Realty" });
  const attrs = { kind: "property", price_label: clean(b.priceLabel, 40), location: clean(b.location, 80) || "Tampa Bay, FL", image: "/assets/hero-luxury.jpg", hold: HOLD_TERMS };
  if ((await db.select("listings", { id: OWNER.listing })).length) await db.update("listings", { id: OWNER.listing }, { title, attributes: attrs });
  else await db.insert("listings", { id: OWNER.listing, org_id: OWNER.org, vertical_id: verticalId, title, status: "active", attributes: attrs });
  if ((await db.select("shows", { id: OWNER.show })).length) await db.update("shows", { id: OWNER.show }, { title, category, status: "live" });
  else {
    await db.insert("shows", { id: OWNER.show, org_id: OWNER.org, vertical_id: verticalId, title, category, status: "live" });
    await db.insert("show_listings", { show_id: OWNER.show, listing_id: OWNER.listing });
  }

  const prev = (await db.select("streams", { id: OWNER.stream }))[0] || null;
  const meta = {
    ...(prev?.meta || {}), owner: true, title, category, category_label: CATEGORY_LABELS[category], cta: "showing",
    host_name: "Dorota Maslowska", location: attrs.location, price_label: attrs.price_label, thumbnail: "/assets/hero-luxury.jpg", likes: prev?.meta?.likes || 0,
  };
  let playback = url;
  if (mode === "cloudflare") {
    if (!meta.cf_input_uid) {
      const input = await createLiveInput({ name: "Dorota Maslowska — owner channel", streamId: OWNER.stream });
      meta.cf_input_uid = input.uid;
      playback = input.hls;
    } else playback = hlsUrlFor(meta.cf_input_uid);
  }
  const row = { provider, playback_url: playback, status: "live", meta };
  if (prev) await db.update("streams", { id: OWNER.stream }, row);
  else await db.insert("streams", { id: OWNER.stream, show_id: OWNER.show, room_id: "room-owner", viewer_count: 0, ...row });
  invalidateStreams();
  if (mode === "link") broadcastAll({ type: "stream_status", streamId: OWNER.stream, live: true });
  await audit("owner.live_started", "streams", OWNER.stream, { mode, provider });
  res.json(await ownerState());
}));

admin.post("/my-live/stop", wrap(async (req, res) => {
  const rows = await db.update("streams", { id: OWNER.stream }, { status: "ended" });
  if (!rows.length) return fail(res, 404, "You haven't started a live yet.");
  invalidateStreams();
  broadcastAll({ type: "stream_status", streamId: OWNER.stream, live: false, ended: true });
  await audit("owner.live_stopped", "streams", OWNER.stream);
  res.json(await ownerState());
}));

// ------------------------------------------------------------------ setup checklist (admin home)
admin.get("/setup", wrap(async (req, res) => {
  const cf = config.cloudflare, r = config.resend;
  const missing = (pairs) => pairs.filter(([, v]) => !v).map(([k]) => k);
  const item = (key, label, ok, detail, fix) => ({ key, label, ok: !!ok, detail, fix: ok ? null : fix });
  res.json({ items: [
    item("database", "Database (Supabase)", db.kind === "supabase", dbDiagnostics.reason || db.kind, "Render → Environment: SUPABASE_URL and SUPABASE_SERVICE_KEY (the sb_secret_… key)."),
    item("email", "Lead alert emails (Resend)", r.key && r.from && config.leads.ownerEmail && !/@resend\.dev/i.test(r.from),
      !r.key ? "No RESEND_API_KEY" : !config.leads.ownerEmail ? "No LEAD_ALERT_EMAIL" : /@resend\.dev/i.test(r.from || "") ? "Using Resend's test sender — only you receive mail; leads get no follow-ups" : `Sending as ${r.from} → alerts to ${config.leads.ownerEmail}`,
      "Verify bridgesglobal.co in Resend (Domains → Add → copy the DNS records into Cloudflare DNS → Verify), then set RESEND_FROM=Dorota Maslowska <dd@bridgesglobal.co>."),
    item("crm", "CRM (HubSpot)", config.crm.hubspotToken || config.crm.ghlWebhook || config.crm.webhook, config.crm.hubspotToken ? "HubSpot connected" : config.crm.ghlWebhook ? "GoHighLevel webhook" : "Not connected", "Render → Environment: HUBSPOT_TOKEN (private app token)."),
    item("followups", "Follow-ups on time (cron)", config.cronSecret, config.cronSecret ? "CRON_SECRET set — make sure cron-job.org calls /api/cron/followups every 15 min" : "No CRON_SECRET", "Set CRON_SECRET, then create a cron-job.org job (see Daily guide)."),
    item("whatsapp", "WhatsApp button", config.leads.whatsappNumber, config.leads.whatsappNumber ? `+${config.leads.whatsappNumber}` : "No number", "assets/js/site-config.js → whatsappNumber."),
    item("cloudflare", "Phone streaming (Cloudflare Stream)", cloudflareEnabled(), cloudflareEnabled() ? "Ready — you and approved agents get stream keys" : `Missing ${missing([["CF_ACCOUNT_ID", cf.accountId], ["CF_STREAM_TOKEN", cf.token], ["CF_SUBDOMAIN", cf.customerCode]]).join(", ")}`, "Add CF_ACCOUNT_ID, CF_STREAM_TOKEN and CF_SUBDOMAIN in Render. Until then, use a YouTube/TikTok live link."),
    item("ai", "Today's Content AI (Anthropic)", aiEnabled(), aiEnabled() ? `Using ${config.anthropic.model}` : "Using the built-in templates", "Add ANTHROPIC_API_KEY in Render for fresh AI-written scripts every day."),
    item("demo", "No demo data on the site", !config.showSeedStreams && !config.demoMode, config.showSeedStreams || config.demoMode ? "Demo streams or demo viewer counts are on" : "Only real streams and real viewer counts", "Set SHOW_SEED_STREAMS=false and DEMO_MODE=false in Render."),
  ] });
}));

// ------------------------------------------------------------------ Today's Content
admin.get("/content", wrap(async (req, res) => {
  const date = today();
  res.json({
    today: date, theme: themeFor(date), ai: aiEnabled(), model: aiEnabled() ? config.anthropic.model : null, video: videoProvider(),
    themes: Object.entries(THEMES).map(([d, t]) => ({ day: Number(d), key: t.key, label: t.label })),
    posts: await recentPosts(14),
  });
}));
admin.post("/content/generate", wrap(async (req, res) => {
  const b = req.body || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : today();
  const theme = Object.values(THEMES).some((t) => t.key === b.theme) ? b.theme : undefined;
  const r = await generateForDate(date, { theme, notes: clean(b.notes, 600) });
  await audit("content.generated", "content_posts", r.post?.id, { date, source: r.post?.source });
  res.json(r);
}));
admin.post("/content/:id", wrap(async (req, res) => {
  const status = ["draft", "filmed", "posted"].includes(req.body?.status) ? req.body.status : null;
  if (!status) return fail(res, 400, "Unknown status");
  const rows = await db.update("content_posts", { id: req.params.id }, { status, updated_at: new Date().toISOString() });
  if (!rows.length) return fail(res, 404, "Post not found");
  res.json({ post: rows[0] });
}));
admin.post("/content/:id/video", wrap(async (req, res) => {
  const post = (await db.select("content_posts", { id: req.params.id }))[0];
  if (!post) return fail(res, 404, "Post not found");
  res.json(await renderVideo(post));
}));

admin.get("/streams", wrap(async (req, res) => {
  const rows = await db.select("streams", {}, { order: "created_at", limit: 300 });
  res.json({ streams: rows.filter((r) => r.meta?.applicant).map((r) => {
    const { host_token_hash, ...meta } = r.meta || {};
    return { id: r.id, status: r.status, provider: r.provider, playbackUrl: r.playback_url, createdAt: r.created_at, ...meta, hasHostLink: !!host_token_hash, liveNow: r.provider === "cloudflare" ? liveNow(r) : null, cloudflare: cloudflareEnabled() };
  }) });
}));
admin.post("/streams/:id/reject", wrap(async (req, res) => {
  const rows = await db.update("streams", { id: req.params.id }, { status: "rejected" });
  if (!rows.length) return fail(res, 404, "Stream not found");
  if (rows[0].meta?.cf_input_uid && cloudflareEnabled()) await deleteLiveInput(rows[0].meta.cf_input_uid).catch((e) => console.warn("[cloudflare delete]", e.message));
  invalidateStreams();
  broadcast(req.params.id, { type: "stream_status", status: "ended" });
  await audit("stream.rejected", "streams", req.params.id);
  res.json({ ok: true });
}));
// ListingReel (separate Next.js app, same Supabase project, lr_* tables) — summary for the Bridges admin.
admin.get("/listingreel", wrap(async (req, res) => {
  if (db.kind !== "supabase") return res.json({ connected: false, reason: "Bridges is using the local test database — connect Supabase to see ListingReel." });
  const safe = (t, opts) => db.select(t, {}, opts).catch(() => null);
  const [users, listings, videos, subs, clicks] = await Promise.all([
    safe("lr_users", { order: "created_at", limit: 500 }), safe("lr_listings", { order: "created_at", limit: 500 }),
    safe("lr_videos", { limit: 1000 }), safe("lr_subscriptions", { limit: 500 }), safe("lr_click_events", { limit: 5000 }),
  ]);
  if (users === null) return res.json({ connected: false, reason: "ListingReel tables not found — run listingreel/supabase/migrations/001_init.sql in the Supabase SQL Editor." });
  const byUser = Object.fromEntries((users || []).map((u) => [u.id, u]));
  res.json({
    connected: true,
    agents: users.length,
    paying: (subs || []).filter((s) => s.status === "active").length,
    trialing: (subs || []).filter((s) => s.status === "trialing").length,
    listings: (listings || []).length,
    videosReady: (videos || []).filter((v) => v.render_status === "ready").length,
    videosRendering: (videos || []).filter((v) => v.render_status === "rendering").length,
    ctaClicks: (clicks || []).length,
    recentAgents: users.slice(0, 20).map((u) => ({ email: u.email, name: u.full_name, joined: u.created_at, listings: (listings || []).filter((l) => l.user_id === u.id).length })),
    recentListings: (listings || []).slice(0, 20).map((l) => ({ address: l.address, status: l.status, agent: byUser[l.user_id]?.email || "", created: l.created_at })),
  });
}));
admin.get("/pipeline", wrap(async (req, res) => {
  const [events, followups, unsubs] = await Promise.all([
    db.select("lead_events", {}, { order: "created_at", limit: 300 }).catch(() => []),
    db.select("lead_followups", {}, { order: "send_at", desc: false, limit: 1000 }).catch(() => []),
    db.select("lead_unsubscribes", {}, { limit: 1000 }).catch(() => []),
  ]);
  const count = (arr, k) => arr.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
  res.json({ integrations: integrations(), events: events.slice(0, 100), followups: count(followups, "status"),
    upcoming: followups.filter((f) => f.status === "pending").slice(0, 50), unsubscribed: unsubs.length });
}));
admin.post("/followups/stop", wrap(async (req, res) => {
  const email = clean(req.body?.email, 120).toLowerCase();
  if (!validEmail(email)) return fail(res, 400, "email required");
  const rows = await db.update("lead_followups", { email, status: "pending" }, { status: "cancelled", detail: "stopped by admin" });
  res.json({ ok: true, cancelled: rows.length });
}));
admin.get("/prospects", wrap(async (req, res) => res.json({ prospects: await db.select("prospects", {}, { order: "created_at", limit: 300 }).catch(() => []) })));
admin.post("/prospects/scan", wrap(async (req, res) => res.json(await scanReddit())));
admin.post("/prospects/:id", wrap(async (req, res) => {
  const status = ["new", "contacted", "ignored"].includes(req.body?.status) ? req.body.status : null;
  if (!status) return fail(res, 400, "status must be new | contacted | ignored");
  const rows = await db.update("prospects", { id: req.params.id }, { status });
  res.json({ ok: !!rows.length });
}));
admin.post("/streams/:id/host-link", wrap(async (req, res) => {
  const s0 = (await db.select("streams", { id: req.params.id }))[0];
  if (!s0) return fail(res, 404, "Stream not found");
  if (s0.provider !== "cloudflare") {
    if (!cloudflareEnabled()) return fail(res, 409, "Cloudflare Stream is not configured (CF_ACCOUNT_ID, CF_STREAM_TOKEN, CF_SUBDOMAIN).");
    if (s0.status !== "live") return fail(res, 409, "Approve the stream first.");
    if (s0.playback_url) return fail(res, 409, "This stream uses its own video link (e.g. YouTube) — no Cloudflare input needed.");
    return res.json({ hostUrl: await provisionCloudflare(s0) });
  }
  res.json({ hostUrl: hostLink(await issueHostToken(s0)) }); // new link; the old one stops working
}));
admin.get("/orders", wrap(async (req, res) => res.json({ orders: await db.select("orders", {}, { order: "created_at", limit: 200 }) })));
admin.get("/leads", wrap(async (req, res) => res.json({ leads: await db.select("leads", {}, { order: "created_at", limit: 500 }) })));
export const LEAD_STAGES = ["New", "Contacted", "Showing booked", "Under contract", "Closed", "Lost"];
admin.post("/leads/:id", wrap(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.stage != null) { if (!LEAD_STAGES.includes(b.stage)) return fail(res, 400, "Unknown stage"); patch.stage = b.stage; }
  if (b.notes != null) patch.notes = clean(b.notes, 2000);
  if (!Object.keys(patch).length) return fail(res, 400, "Nothing to update");
  const rows = await db.update("leads", { id: req.params.id }, patch);
  if (!rows.length) return fail(res, 404, "Lead not found");
  await audit("lead.updated", "leads", req.params.id, patch);
  res.json({ lead: rows[0] });
}));
admin.get("/comments", wrap(async (req, res) => {
  const match = {};
  if (req.query.intent) match.intent = clean(req.query.intent, 20);
  if (req.query.moderation) match.moderation = clean(req.query.moderation, 20);
  res.json({ comments: await db.select("comment_events", match, { order: "created_at", limit: 200 }) });
}));
admin.post("/comments/:id", wrap(async (req, res) => {
  const action = { hide: "hidden", approve: "visible", flag: "flagged" }[req.body?.action];
  if (!action) return fail(res, 400, "action must be hide | approve | flag");
  const rows = await db.update("comment_events", { id: req.params.id }, { moderation: action });
  if (!rows.length) return fail(res, 404, "Comment not found");
  await audit(`moderation.${req.body.action}`, "comment_events", req.params.id);
  res.json({ ok: true, comment: rows[0] });
}));
admin.post("/holds/:id/void", wrap(async (req, res) => {
  const order = (await db.select("orders", { id: req.params.id, kind: "hold" }))[0];
  if (!order) return fail(res, 404, "Hold not found");
  if (order.status !== "authorized") return fail(res, 409, `Hold is ${order.status}, not authorized.`);
  await paypal.voidAuthorization(order.provider_capture_id);
  await db.update("orders", { id: order.id }, { status: "voided", updated_at: new Date().toISOString() });
  await audit("hold.voided", "orders", order.id);
  res.json({ ok: true, status: "voided" });
}));
api.use("/admin", admin);

// ------------------------------------------------------------------ errors
api.use((req, res) => fail(res, 404, "Not found"));
// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  console.error("[api]", req.method, req.originalUrl, err.message);
  const status = err.status && err.status < 500 ? 502 : 500;
  res.status(status).json({ error: status === 502 ? "Payment provider rejected the request." : "Something went wrong — please try again." });
});
