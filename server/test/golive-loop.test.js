// The core loop, end to end, against fake Cloudflare / Resend / HubSpot servers:
// owner goes live from the phone (Cloudflare) → the site shows LIVE with the HLS player →
// a viewer taps "Request a showing" → lead saved → email alert → HubSpot contact.
// Plus the fallback: a pasted TikTok / Instagram live link shows as "Live on TikTok — watch".
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 4500 + Math.floor(Math.random() * 80);
const FAKE = PORT + 100;
const BASE = `http://localhost:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bl-loop-"));
const inputs = new Map(), emails = [], contacts = [];
let proc, fake, n = 0;
const admin = { Authorization: "Bearer own3r-token" };
const post = (p, body, headers = {}) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const get = (p, headers = {}) => fetch(BASE + p, { headers }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = ""; req.on("data", (d) => (raw += d)); req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      const life = req.url.match(/^\/([\w-]+)\/lifecycle$/);
      if (life) return res.end(JSON.stringify({ isInput: true, live: !!inputs.get(life[1])?.live }));
      const m = req.url.match(/^\/cf\/accounts\/acc1\/stream\/live_inputs(?:\/([\w-]+))?$/);
      if (m) {
        const shape = (uid) => ({ uid, rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: `key-${uid}` }, srt: { url: "srt://live.cloudflare.com:778", streamId: uid } });
        if (req.method === "POST") { const uid = `in${++n}`; inputs.set(uid, { live: false }); return res.end(JSON.stringify({ success: true, result: shape(uid) })); }
        return res.end(JSON.stringify({ success: true, result: shape(m[1]) }));
      }
      if (req.url === "/resend/emails") { emails.push(JSON.parse(raw)); return res.end(JSON.stringify({ id: `em${emails.length}` })); }
      if (req.url === "/hubspot/crm/v3/objects/contacts/batch/upsert") { contacts.push(JSON.parse(raw)); return res.end(JSON.stringify({ results: [{ id: `c${contacts.length}` }] })); }
      res.statusCode = 404; res.end("{}");
    });
  }).listen(FAKE);
  proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", ADMIN_TOKEN: "own3r-token", SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "", BL_LOCAL_DB: path.join(TMP, "db.json"), APP_URL: BASE,
      PAYPAL_CLIENT_ID: "", PAYPAL_SECRET: "", DEMO_MODE: "false", SHOW_SEED_STREAMS: "false", AUTO_APPROVE_STREAMS: "false",
      CF_ACCOUNT_ID: "acc1", CF_STREAM_TOKEN: "cf-tok", CF_SUBDOMAIN: "customer-abc.cloudflarestream.com", CF_API_BASE: `http://localhost:${FAKE}/cf`, CF_DELIVERY_BASE: `http://localhost:${FAKE}`, CF_POLL_MS: "200",
      RESEND_API_KEY: "re_test", RESEND_FROM: "Dorota <dd@bridgesglobal.co>", RESEND_API_BASE: `http://localhost:${FAKE}/resend`, LEAD_ALERT_EMAIL: "", BUSINESS_ADDRESS: "Tampa, FL",
      HUBSPOT_TOKEN: "hs-tok", HUBSPOT_API_BASE: `http://localhost:${FAKE}/hubspot` },
    stdio: "pipe",
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await wait(100); }
  throw new Error("server did not start");
});
after(() => { proc?.kill(); fake?.close(); });

test("only ADMIN_TOKEN opens the admin API", async () => {
  assert.equal((await get("/api/admin/my-live")).status, 401);
  assert.equal((await get("/api/admin/my-live", { Authorization: "Bearer wrong" })).status, 401);
  assert.equal((await get("/api/admin/my-live", { "x-host-token": "anything" })).status, 401, "an agent host token is not an admin login");
  assert.equal((await get("/api/admin/my-live", admin)).status, 200);
});

test("phone (Cloudflare) live → LIVE on the site → Request a showing → saved + email alert + HubSpot", async () => {
  const start = await post("/api/admin/my-live", { mode: "cloudflare", title: "Model home tour — Riverview", location: "Riverview, FL", category: "new" }, admin);
  assert.equal(start.status, 200);
  assert.match(start.body.ingest.rtmpsUrl, /^rtmps:/, "stream URL for Larix");
  assert.equal(start.body.ingest.streamKey, "key-in1", "stream key for Larix");
  // before the phone connects: on the site as "upcoming", never as LIVE
  let s = (await get("/api/slots?n=24")).body;
  assert.equal(s.liveCount, 0);
  assert.equal(s.slots[0].kind, "upcoming");
  // the phone starts broadcasting
  inputs.get("in1").live = true;
  for (let i = 0; i < 40 && (await get("/api/slots?n=24")).body.liveCount === 0; i++) await wait(100);
  s = (await get("/api/slots?n=24")).body;
  assert.equal(s.liveCount, 1, "the site shows the stream as LIVE");
  const live = s.slots[0];
  assert.equal(live.kind, "live");
  assert.match(live.stream.playbackUrl, /in1\/manifest\/video\.m3u8$/, "plays natively on the site (HLS)");
  // a viewer on the stream taps Request a showing
  const r = await post("/api/showings", { streamId: live.stream.id, name: "Maria Viewer", email: "maria@example.com", phone: "8135550100", when: "Saturday 10am", message: "Is the lot fenced?" });
  assert.equal(r.status, 201);
  for (let i = 0; i < 50 && (!emails.length || !contacts.length); i++) await wait(100);
  const alert = emails.find((e) => e.to.includes("realtordorota@gmail.com"));
  assert.ok(alert, "email alert sent to realtordorota@gmail.com");
  assert.match(alert.subject + alert.text, /Maria/);
  const c = contacts[0]?.inputs?.[0];
  assert.equal(c?.id, "maria@example.com", "contact upserted in HubSpot");
  const leads = (await get("/api/admin/leads", admin)).body;
  const rows = leads.leads || leads.rows || leads;
  assert.ok(JSON.stringify(rows).includes("maria@example.com"), "lead saved in the database (Supabase in production)");
});

test("fallback: a pasted TikTok or Instagram live shows as 'Live on …' with a watch link, never a fake embed", async () => {
  for (const url of ["https://www.tiktok.com/@realtor_dorota/live", "https://www.instagram.com/realtordorota/live/"]) {
    const r = await post("/api/admin/my-live", { mode: "link", url, title: "Live now", category: "new" }, admin);
    assert.equal(r.status, 200, url);
    const live = (await get("/api/slots?n=24")).body.slots.find((x) => x.kind === "live");
    assert.equal(live.stream.playbackUrl, url);
    assert.equal(live.stream.provider, /tiktok/.test(url) ? "tiktok" : "instagram");
  }
  assert.equal((await post("/api/admin/my-live", { mode: "link", url: "https://evil.example/live", title: "x" }, admin)).status, 400);
});

test("roles: an approved builder gets ONLY their own host dashboard — never the admin", async () => {
  const app = await post("/api/streams", { name: "Bea Builder", email: "bea@builder.example", title: "Model home — Parrish", category: "new", role: "builder", brokerage: "Example Homes" });
  assert.equal(app.status, 201);
  assert.equal(app.body.status, "pending_review", "public applications wait for approval");
  assert.equal(app.body.hostUrl, null, "no host link before approval");
  const ok = await post(`/api/admin/streams/${app.body.streamId}/approve`, {}, admin);
  assert.equal(ok.status, 200);
  const hostToken = new URL(ok.body.hostUrl).hash.replace("#t=", "");
  const mine = await get("/api/host/stream", { "x-host-token": hostToken });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.role, "builder");
  assert.equal(mine.body.streamId, app.body.streamId, "only their own stream");
  assert.ok(!("leads" in mine.body), "no leads in the host dashboard");
  for (const path of ["/api/admin/leads", "/api/admin/my-live", "/api/admin/setup", "/api/admin/streams"]) {
    assert.equal((await get(path, { "x-host-token": hostToken })).status, 401, `host link cannot open ${path}`);
    assert.equal((await get(path, { Authorization: `Bearer ${hostToken}` })).status, 401, `host token is not an admin password (${path})`);
  }
  assert.equal((await get("/api/host/stream", { "x-host-token": "x".repeat(40) })).status, 401, "a made-up host link opens nothing");
  const page = await fetch(BASE + "/admin");
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
});

test("every lead source → realtordorota@gmail.com alert + HubSpot + admin Leads + automatic first reply", async () => {
  const mail = (to) => emails.filter((e) => e.to.includes(to));
  // the stream lead from the earlier test also got its automatic first reply
  for (let i = 0; i < 40 && !mail("maria@example.com").length; i++) await wait(100);
  assert.ok(mail("maria@example.com").length >= 1, "auto-reply / follow-up #1 sent to the stream lead");
  // website form (Request a showing on a listing, apartments, home value…)
  const f = await post("/api/lead-router", { first_name: "Tom", last_name: "Form", email: "tom@example.com", phone: "8135550111", source: "Website — Request a showing", notes: "3 bed in Riverview" });
  assert.ok(f.status < 300, JSON.stringify(f.body));
  for (let i = 0; i < 50 && (!mail("tom@example.com").length || !contacts.some((c) => c.inputs[0].id === "tom@example.com")); i++) await wait(100);
  assert.ok(emails.some((e) => e.to.includes("realtordorota@gmail.com") && /Tom/.test(e.subject + e.text)), "form lead alert to realtordorota@gmail.com");
  assert.ok(contacts.some((c) => c.inputs[0].id === "tom@example.com"), "form lead in HubSpot");
  assert.ok(mail("tom@example.com").length >= 1, "auto-reply to the form lead");
  // WhatsApp tap: no contact details exist yet, so it is logged as a lead + you get an alert (the chat itself is in WhatsApp)
  const before = emails.length;
  const w = await fetch(BASE + "/api/whatsapp-click", { method: "POST", body: JSON.stringify({ page_url: BASE + "/apartment-locating", label: "Apartments page", visitor: "v1" }) });
  assert.ok(w.status < 300);
  for (let i = 0; i < 40 && emails.length === before; i++) await wait(100);
  assert.ok(emails.slice(before).some((e) => e.to.includes("realtordorota@gmail.com") && /WhatsApp/.test(e.subject)), "WhatsApp tap alert");
  const all = JSON.stringify((await get("/api/admin/leads", admin)).body);
  for (const who of ["maria@example.com", "tom@example.com", "WhatsApp"]) assert.ok(all.includes(who), `${who} in the admin Leads tab`);
});
