// Lead pipeline end-to-end: real server + fake Resend / HubSpot / GoHighLevel APIs.
// Verifies: lead saved, email alert to the agent, CRM upsert + webhook, 5-touch email sequence
// scheduled with touch 1 sent immediately, dedupe, honeypot, unsubscribe, live-show/showing path,
// WhatsApp button taps logged as leads.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 4100 + Math.floor(Math.random() * 80);
const FAKE = PORT + 100;
const BASE = `http://localhost:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bl-leads-"));
const calls = [];
let proc, fake;

const post = (p, body, headers = {}) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const get = (p, headers = {}) => fetch(BASE + p, { headers }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const of = (kind) => calls.filter((c) => c.kind === kind);

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const kind = req.url.includes("/Messages.json") ? "twilio" : req.url === "/emails" ? "resend" : req.url.includes("/crm/v3/") ? "hubspot" : req.url === "/ghl" ? "ghl" : "other";
      let body = raw;
      try { body = kind === "twilio" ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw); } catch {}
      calls.push({ kind, url: req.url, auth: req.headers.authorization, body });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(kind === "twilio" ? { sid: "SM" + calls.length } : kind === "resend" ? { id: "em_" + calls.length } : kind === "hubspot" ? { results: [{ id: "hs1" }] } : { ok: true }));
    });
  }).listen(FAKE);
  const f = `http://localhost:${FAKE}`;
  proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", ADMIN_TOKEN: "t0ken", CRON_SECRET: "cron-secret-123456", SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "",
      PAYPAL_CLIENT_ID: "", PAYPAL_SECRET: "", BL_LOCAL_DB: path.join(TMP, "db.json"), APP_URL: BASE,
      LEAD_ALERT_EMAIL: "owner@example.com", WHATSAPP_NUMBER: "301-379-6785",
      RESEND_API_KEY: "re_123", RESEND_FROM: "Dorota <dd@bridgesglobal.co>", RESEND_API_BASE: f,
      HUBSPOT_TOKEN: "pat-123", HUBSPOT_API_BASE: f, GHL_WEBHOOK_URL: `${f}/ghl` },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {}
    await wait(100);
  }
  throw new Error("server did not start");
});
after(() => { proc?.kill(); fake?.close(); });

test("site form → saved, agent emailed, CRM synced, email sequence started", async () => {
  const r = await post("/api/lead-router", { first_name: "Ana Lee", email: "Ana@Example.com", phone: "(813) 555-1234", market: "Tampa Bay", source: "Website — Tampa",
    notes: "Moving from Chicago in June", page_url: "https://live.bridgesglobal.co/tampa", utm: { utm_source: "facebook", utm_campaign: "relo", evil: "x" }, sms_consent: true });
  assert.equal(r.status, 201);
  assert.equal(r.body.booking_url, undefined, "no call booking");
  const d = r.body.delivery;
  assert.deepEqual([d.alert_sms, d.alert_email, d.crm, d.sequence], [undefined, "sent", "sent", "scheduled"]);
  await wait(400); // touch 1 goes out right away
  assert.equal(of("other").length, 0, "no SMS provider is ever called");

  const emails = of("resend");
  const ownerMail = emails.find((c) => c.body.to[0] === "owner@example.com");
  assert.match(ownerMail.body.subject, /New lead: Ana Lee/);
  assert.match(ownerMail.body.html, /wa\.me\/18135551234/, "WhatsApp quick-reply link to the lead");
  assert.match(ownerMail.body.html, /utm_source=facebook/);
  assert.doesNotMatch(ownerMail.body.html, /evil/, "only utm/click-id keys are kept");
  const welcome = emails.find((c) => c.body.to[0] === "ana@example.com");
  assert.match(welcome.body.subject, /Got it, Ana/);
  assert.doesNotMatch(welcome.body.html, /calendly|Book a/i);
  assert.match(welcome.body.html, /reply to this email or message me on WhatsApp/i);
  assert.match(welcome.body.html, /href="https:\/\/wa\.me\/13013796785"/);
  assert.match(welcome.body.html, /\/api\/unsubscribe\?e=/);
  assert.ok(welcome.body.headers["List-Unsubscribe"]);

  const hs = of("hubspot")[0];
  assert.equal(hs.auth, "Bearer pat-123");
  assert.equal(hs.body.inputs[0].id, "ana@example.com");
  assert.equal(hs.body.inputs[0].properties.firstname, "Ana");
  assert.equal(of("ghl")[0].body.email, "ana@example.com");

  const auth = { Authorization: "Bearer t0ken" };
  const leads = (await get("/api/admin/leads", auth)).body.leads;
  const row = leads.find((l) => l.email === "ana@example.com");
  assert.equal(row.page_url, "https://live.bridgesglobal.co/tampa");
  assert.equal(row.sms_consent, true);
  const pipe = (await get("/api/admin/pipeline", auth)).body;
  assert.equal(pipe.followups.sent, 1);
  assert.equal(pipe.followups.pending, 4);
  assert.deepEqual(pipe.upcoming.map((f) => f.step), [2, 3, 4, 5]);
});

test("same person again within 12h → saved + emailed as update, no second sequence", async () => {
  const before = calls.length;
  const r = await post("/api/lead-router", { first_name: "Ana", email: "ana@example.com", source: "Website — AI Concierge Chat (follow-up notes)", notes: "prefers pool" });
  assert.equal(r.body.delivery.update, true);
  assert.equal(r.body.delivery.alert_sms, undefined);
  assert.equal(r.body.delivery.sequence, undefined);
  await wait(200);
  const fresh = calls.slice(before);
  assert.match(fresh.find((c) => c.kind === "resend").body.subject, /Lead update/);
});

test("bots: honeypot filled → nothing sent; missing contact → 400", async () => {
  const before = calls.length;
  assert.equal((await post("/api/lead-router", { first_name: "Bot", email: "bot@spam.com", company_website: "http://spam" })).status, 201);
  assert.equal((await post("/api/lead-router", { first_name: "No contact" })).status, 400);
  await wait(150);
  assert.equal(calls.length, before);
});

test("live stream viewer (Request a showing) goes through the same pipeline", async () => {
  const s = (await get("/api/streams")).body.streams.find((x) => x.cta === "showing");
  const before = calls.length;
  const r = await post("/api/showings", { streamId: s.id, name: "Kai Viewer", email: "kai@example.com", phone: "813-555-7777", when: "Sat 10am" });
  assert.equal(r.status, 201);
  await wait(400);
  const fresh = calls.slice(before);
  assert.ok(fresh.some((c) => c.kind === "resend" && c.body.to[0] === "owner@example.com" && /Kai Viewer/.test(c.body.subject) && /Request a showing/.test(c.body.subject)));
  assert.ok(fresh.some((c) => c.kind === "resend" && c.body.to[0] === "kai@example.com"), "viewer gets touch 1");
  assert.ok(fresh.some((c) => c.kind === "hubspot" && c.body.inputs[0].id === "kai@example.com"));
});

test("unsubscribe cancels the remaining touches; cron endpoint is protected", async () => {
  const auth = { Authorization: "Bearer t0ken" };
  const welcome = calls.find((c) => c.kind === "resend" && c.body.to[0] === "ana@example.com" && /Got it/.test(c.body.subject));
  const link = welcome.body.html.match(/href="([^"]*\/api\/unsubscribe[^"]*)"/)[1].replace(/&amp;/g, "&");
  const bad = await fetch(link.replace(/t=[^&]+/, "t=forged"));
  assert.match(await bad.text(), /not valid/);
  const ok = await fetch(link);
  assert.match(await ok.text(), /unsubscribed/);
  const pipe = (await get("/api/admin/pipeline", auth)).body;
  assert.equal(pipe.unsubscribed, 1);
  assert.ok(!pipe.upcoming.some((f) => f.email === "ana@example.com"));
  assert.equal((await post("/api/cron/followups", {})).status, 401);
  assert.equal((await post("/api/cron/followups", {}, { Authorization: "Bearer cron-secret-123456" })).status, 200);
});

test("Resend test sender (onboarding@resend.dev) only emails the owner; leads are skipped with a reason", async () => {
  const { sendEmail } = await import("../leads/providers.js");
  const { config } = await import("../config.js");
  const saved = { ...config.resend }, owner = config.leads.ownerEmail;
  Object.assign(config.resend, { key: "re_x", from: "Bridges Global Leads <onboarding@resend.dev>", base: "http://127.0.0.1:9" });
  config.leads.ownerEmail = "owner@example.com";
  const r = await sendEmail({ to: "lead@example.com", subject: "x", html: "x", text: "x" });
  assert.equal(r.status, "skipped");
  assert.match(r.detail, /verify bridgesglobal\.co/);
  Object.assign(config.resend, saved); config.leads.ownerEmail = owner;
});

test("HubSpot: existing contact further along than 'lead' is still updated (retry without stage)", async () => {
  const hs = http.createServer((req, res) => {
    let raw = ""; req.on("data", (d) => (raw += d)); req.on("end", () => {
      const props = JSON.parse(raw).inputs[0].properties;
      hs.seen.push(props);
      if (props.lifecyclestage) { res.statusCode = 400; return res.end(JSON.stringify({ message: "Property values were not valid: lifecyclestage cannot be set backwards" })); }
      res.end(JSON.stringify({ results: [{ id: "77" }] }));
    });
  });
  hs.seen = [];
  await new Promise((r) => hs.listen(0, r));
  const { syncCrm } = await import("../leads/providers.js");
  const { config } = await import("../config.js");
  const saved = { ...config.crm };
  Object.assign(config.crm, { hubspotToken: "pat-x", hubspotBase: `http://127.0.0.1:${hs.address().port}`, ghlWebhook: "", webhook: "" });
  const [r] = await syncCrm({ email: "old.client@example.com", first_name: "Old Client", source: "Website" });
  Object.assign(config.crm, saved); hs.close();
  assert.equal(r.status, "sent");
  assert.equal(hs.seen.length, 2);
  assert.equal(hs.seen[1].lifecyclestage, undefined);
  assert.equal(hs.seen[1].firstname, "Old");
});

test("WhatsApp button tap → anonymous lead in Supabase + one email alert per visitor", async () => {
  const before = calls.length;
  const tap = (body) => fetch(BASE + "/api/whatsapp-click", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const r = await tap({ page_url: "https://live.bridgesglobal.co/live-show/?stream=x", label: "Live Show", stream_title: "Triple Creek — Model B", utm: { utm_source: "instagram" }, visitor: "v-123" });
  assert.equal(r.status, 201);
  assert.equal(r.body.alert_email, "sent");
  await wait(150);
  const mail = calls.slice(before).find((c) => c.kind === "resend");
  assert.equal(mail.body.to[0], "owner@example.com");
  assert.match(mail.body.subject, /WhatsApp chat started — Triple Creek/);
  assert.match(mail.body.html, /utm_source=instagram/);
  // same visitor taps again within 30 min → logged, but no second email
  const again = await tap({ page_url: "https://live.bridgesglobal.co/tampa/", label: "Tampa", visitor: "v-123" });
  assert.equal(again.body.alert_email, "skipped");
  await wait(100);
  assert.equal(calls.slice(before).filter((c) => c.kind === "resend").length, 1);
  const leads = (await get("/api/admin/leads", { Authorization: "Bearer t0ken" })).body.leads.filter((l) => /^WhatsApp click/.test(l.source));
  assert.equal(leads.length, 2);
  assert.match(leads.find((l) => /Triple Creek/.test(l.source)).notes, /Opened a WhatsApp chat/);
  assert.equal((await tap({ company_website: "spam" })).status, 204, "honeypot");
  const health = (await get("/api/admin/pipeline", { Authorization: "Bearer t0ken" })).body.integrations;
  assert.equal(health.whatsapp, true);
  assert.equal(health.sms, undefined);
});
