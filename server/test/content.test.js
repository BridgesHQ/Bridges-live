// Today's Content: AI generation through the Anthropic SDK (fake API), template fallback,
// admin endpoints, status changes, video hook, and the cron that writes + emails the day's post.
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bl-content-"));
const calls = [];
let fake, proc, refuse = false, MODEL;
const admin = { Authorization: "Bearer t0ken", "Content-Type": "application/json" };
const post = (p, body, h = admin) => fetch(BASE + p, { method: "POST", headers: h, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const get = (p, h = admin) => fetch(BASE + p, { headers: h }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const AI = {
  title: "Riverview incentives", hook: "Builders in Riverview are paying closing costs.",
  script: [{ time: "0:00-0:03", say: "Builders in Riverview are paying closing costs." }, { time: "0:03-0:30", say: "Ask for the [credit]." }],
  on_screen_text: ["Ask for the credit"], caption: "Ask for the [credit].\n\nDorota Maslowska, Broker Associate | LPT Realty",
  hashtags: ["#TampaRealEstate", "#Riverview"], shotlist: [{ shot: "Hook", how: "selfie", seconds: 3 }],
  cta: "Watch live at live.bridgesglobal.co", compliance_check: "Broker line present; verify [credit].",
};

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = ""; req.on("data", (d) => (raw += d)); req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ url: req.url, headers: req.headers, body });
      res.setHeader("Content-Type", "application/json");
      if (req.url.startsWith("/v1/messages")) {
        if (refuse) return res.end(JSON.stringify({ id: "msg_r", type: "message", role: "assistant", model: body.model, content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null }, usage: { input_tokens: 1, output_tokens: 0 } }));
        return res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(AI) }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 } }));
      }
      if (req.url === "/emails") return res.end(JSON.stringify({ id: "em_1" }));
      if (req.url === "/video") return res.end("{}");
      res.statusCode = 404; res.end("{}");
    });
  }).listen(FAKE);
  proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", ADMIN_TOKEN: "t0ken", CRON_SECRET: "cron-secret-123456", SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "", BL_LOCAL_DB: path.join(TMP, "db.json"), APP_URL: BASE,
      PAYPAL_CLIENT_ID: "", PAYPAL_SECRET: "", HUBSPOT_TOKEN: "", HUBSPOT_ACCESS_TOKEN: "", CF_ACCOUNT_ID: "", CF_STREAM_TOKEN: "", CF_SUBDOMAIN: "",
      LEAD_ALERT_EMAIL: "owner@example.com", RESEND_API_KEY: "re_123", RESEND_FROM: "Dorota <dd@bridgesglobal.co>", RESEND_API_BASE: `http://localhost:${FAKE}`,
      ANTHROPIC_API_KEY: "sk-ant-test", CONTENT_EMAIL_ANYTIME: "true", DEMO_MODE: "false", SHOW_SEED_STREAMS: "false", ANTHROPIC_BASE_URL: `http://localhost:${FAKE}`, VIDEO_PROVIDER: "webhook", VIDEO_WEBHOOK_URL: `http://localhost:${FAKE}/video` },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server did not start");
});
after(() => { proc?.kill(); fake?.close(); });

test("admin content needs the admin token", async () => {
  assert.equal((await get("/api/admin/content", {})).status, 401);
  const c = (await get("/api/admin/content")).body;
  assert.equal(c.ai, true);
  assert.ok(c.model);
  MODEL = c.model;
  assert.equal(c.themes.length, 7);
  assert.ok(["market", "model-tour", "buyer-tip", "new-community", "neighborhood", "weekend-tour", "relocation"].includes(c.theme.key));
});

test("weekday themes rotate: Mon market … Fri neighborhood", async () => {
  const days = { "2026-10-12": "market", "2026-10-13": "model-tour", "2026-10-14": "buyer-tip", "2026-10-15": "new-community", "2026-10-16": "neighborhood" };
  for (const [date, key] of Object.entries(days)) {
    const r = await post("/api/admin/content/generate", { date, notes: "Touring Triple Creek" });
    assert.equal(r.status, 200);
    assert.equal(r.body.post.theme, key, date);
  }
});

test("AI call: Anthropic SDK, configured model, structured JSON, default fallbacks", async () => {
  const c = calls.filter((x) => x.url.startsWith("/v1/messages")).at(-1);
  assert.equal(c.headers["x-api-key"], "sk-ant-test");
  assert.match(c.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.equal(c.body.model, MODEL);
  assert.equal(c.body.fallbacks, "default");
  assert.equal(c.body.output_config.format.type, "json_schema");
  assert.ok(c.body.output_config.format.schema.required.includes("shotlist"));
  assert.match(c.body.system, /LPT Realty/);
  assert.match(c.body.system, /Fair Housing/);
  assert.match(c.body.messages[0].content, /Neighborhood guide/);
  assert.match(c.body.messages[0].content, /Touring Triple Creek/);
  const p = (await post("/api/admin/content/generate", { date: "2026-10-16" })).body.post;
  assert.equal(p.source, "ai");
  assert.equal(p.data.hook, AI.hook);
  assert.equal(p.data.shotlist.length, 1);
  assert.equal(p.data.theme_label, "Neighborhood guide");
  // regenerating the same date replaces the draft (one post per day)
  assert.equal((await get("/api/admin/content")).body.posts.filter((x) => String(x.post_date).startsWith("2026-10-16")).length, 1);
});

test("refusal → template fallback with a warning (tab never empty)", async () => {
  refuse = true;
  const r = (await post("/api/admin/content/generate", { date: "2026-10-14" })).body;
  refuse = false;
  assert.match(r.warning, /declined/);
  assert.equal(r.post.source, "template");
  assert.match(r.post.data.caption, /Dorota Maslowska, Broker Associate \| LPT Realty$/);
  assert.ok(r.post.data.shotlist.length >= 5);
  assert.ok(r.post.data.hashtags.every((h) => h.startsWith("#")));
});

test("status: draft → filmed → posted; video hook sends the script", async () => {
  const p = (await get("/api/admin/content")).body.posts[0];
  assert.equal((await post(`/api/admin/content/${p.id}`, { status: "nope" })).status, 400);
  assert.equal((await post(`/api/admin/content/${p.id}`, { status: "posted" })).body.post.status, "posted");
  const v = (await post(`/api/admin/content/${p.id}/video`, {})).body;
  assert.equal(v.status, "sent");
  const hook = calls.filter((c) => c.url === "/video").at(-1);
  assert.ok(hook.body.script.length && hook.body.shotlist.length && hook.body.caption);
});

test("cron writes today's post once and emails it to the owner once", async () => {
  const cron = { Authorization: "Bearer cron-secret-123456", "Content-Type": "application/json" };
  const before = calls.filter((c) => c.url === "/emails").length;
  const r1 = (await post("/api/cron/followups", {}, cron)).body;
  assert.equal(r1.content.emailed, true, JSON.stringify(r1));
  const r2 = (await post("/api/cron/followups", {}, cron)).body;
  assert.equal(r2.content.date, r1.content.date);
  const mails = calls.filter((c) => c.url === "/emails").slice(before);
  assert.equal(mails.length, 1, "emailed once");
  assert.equal(mails[0].body.to[0], "owner@example.com");
  assert.match(mails[0].body.subject, /Today's video/);
});

test("setup checklist + HUBSPOT_ACCESS_TOKEN alias accepted", async () => {
  const items = (await get("/api/admin/setup")).body.items;
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(by.ai.ok, true);
  assert.equal(by.email.ok, true);
  assert.equal(by.cloudflare.ok, false);
  assert.match(by.cloudflare.fix, /CF_SUBDOMAIN/);
  assert.equal(by.demo.ok, true, "no demo data by default");
});
