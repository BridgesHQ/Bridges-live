// Cloudflare Stream: two agents each get their own live input, go live at the same time,
// and the grid / host pages / take-down all behave — against a fake Cloudflare API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORT = 4300 + Math.floor(Math.random() * 80);
const CF = PORT + 100;
const BASE = `http://localhost:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bl-cf-"));
const inputs = new Map();   // uid -> { name, live, deleted }
const seen = [];
let proc, fake, n = 0;

const post = (p, body, headers = {}) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const get = (p, headers = {}) => fetch(BASE + p, { headers }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = { Authorization: "Bearer t0ken" };

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = ""; req.on("data", (d) => (raw += d)); req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
      res.setHeader("Content-Type", "application/json");
      const m = req.url.match(/^\/client\/v4\/accounts\/acc123\/stream\/live_inputs(?:\/([\w-]+))?$/);
      const life = req.url.match(/^\/([\w-]+)\/lifecycle$/);
      if (life) return res.end(JSON.stringify({ isInput: true, live: !!inputs.get(life[1])?.live }));
      if (!m || req.headers.authorization !== "Bearer cf-token") { res.statusCode = 403; return res.end(JSON.stringify({ success: false, errors: [{ message: "forbidden" }] })); }
      const shape = (uid) => ({ uid, rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: `key-${uid}` }, srt: { url: "srt://live.cloudflare.com:778", streamId: uid }, status: inputs.get(uid)?.live ? { current: { state: "connected" } } : null });
      if (req.method === "POST" && !m[1]) { const uid = `in${++n}`; inputs.set(uid, { name: JSON.parse(raw).meta.name, live: false }); return res.end(JSON.stringify({ success: true, result: shape(uid) })); }
      if (req.method === "GET" && m[1] && inputs.has(m[1])) return res.end(JSON.stringify({ success: true, result: shape(m[1]) }));
      if (req.method === "DELETE" && m[1]) { inputs.get(m[1]) && (inputs.get(m[1]).deleted = true); return res.end(JSON.stringify({ success: true, result: null })); }
      res.statusCode = 404; res.end(JSON.stringify({ success: false, errors: [{ message: "not found" }] }));
    });
  }).listen(CF);
  proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", ADMIN_TOKEN: "t0ken", SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "", BL_LOCAL_DB: path.join(TMP, "db.json"), APP_URL: BASE,
      PAYPAL_CLIENT_ID: "", PAYPAL_SECRET: "", RESEND_API_KEY: "", HUBSPOT_TOKEN: "", AUTO_APPROVE_STREAMS: "true",
      CF_ACCOUNT_ID: "acc123", CF_STREAM_TOKEN: "cf-token", CF_SUBDOMAIN: "https://customer-abc123.cloudflarestream.com", CF_API_BASE: `http://localhost:${CF}/client/v4`, CF_DELIVERY_BASE: `http://localhost:${CF}`, CF_POLL_MS: "300" },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await wait(100); }
  throw new Error("server did not start");
});
after(() => { proc?.kill(); fake?.close(); });

let a, b;
test("each approved agent gets their own Cloudflare live input + private host link", async () => {
  a = (await post("/api/streams", { name: "Ana Agent", email: "ana@example.com", title: "Apollo Beach Waterfront", category: "lux" })).body;
  b = (await post("/api/streams", { name: "Ben Broker", email: "ben@example.com", title: "Wesley Chapel New Build", category: "new" })).body;
  assert.equal(a.status, "live");
  assert.match(a.hostUrl, /\/go-live\/#t=[\w-]{30,}$/);
  assert.notEqual(a.hostUrl, b.hostUrl);
  assert.equal([...inputs.values()].length, 2);
  assert.ok(seen.every((s) => !s.url.includes("live_inputs") || s.auth === "Bearer cf-token"));

  const pub = (await get("/api/streams")).body.streams;
  const sa = pub.find((s) => s.id === a.streamId);
  assert.equal(sa.provider, "cloudflare");
  assert.equal(sa.playbackUrl, `http://localhost:${CF}/in1/manifest/video.m3u8`);
  assert.equal(sa.liveNow, false, "not broadcasting yet");
  const dump = JSON.stringify(pub);
  assert.ok(!dump.includes("key-in1") && !dump.includes("host_token") && !dump.includes(a.hostUrl.split("#t=")[1]), "no secrets in the public API");
});

test("host page API returns the stream key only with the right token", async () => {
  const tok = a.hostUrl.split("#t=")[1];
  const ok = await get("/api/host/stream", { "X-Host-Token": tok });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ingest.streamKey, "key-in1");
  assert.equal(ok.body.ingest.rtmpsUrl, "rtmps://live.cloudflare.com:443/live/");
  assert.equal(ok.body.title, "Apollo Beach Waterfront");
  assert.equal((await get("/api/host/stream", { "X-Host-Token": tok.slice(0, -2) + "xx" })).status, 401);
  assert.equal((await get("/api/host/stream")).status, 401);
});

test("two agents live at once: grid flips to LIVE, live-first order, realtime event", async () => {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const events = [];
  ws.on("message", (d) => events.push(JSON.parse(d)));
  await new Promise((r) => ws.on("open", r));
  ws.send(JSON.stringify({ type: "lobby" }));
  inputs.get("in1").live = true;
  inputs.get("in2").live = true;
  await wait(1200);
  const live = events.filter((e) => e.type === "stream_status" && e.live === true).map((e) => e.streamId).sort();
  assert.deepEqual(live, [a.streamId, b.streamId].sort());
  const pub = (await get("/api/streams")).body.streams;
  assert.equal(pub.find((s) => s.id === a.streamId).liveNow, true);
  assert.equal(pub.find((s) => s.id === b.streamId).liveNow, true);
  // Ana stops broadcasting → offline again, drops below live streams
  inputs.get("in1").live = false;
  await wait(1000);
  assert.ok(events.some((e) => e.type === "stream_status" && e.streamId === a.streamId && e.live === false));
  const after = (await get("/api/streams")).body.streams;
  const firstOffline = after.findIndex((s) => s.liveNow === false);
  assert.ok(after.findIndex((s) => s.id === b.streamId) < firstOffline, "live agents sort first");
  ws.close();
});

test("admin: new host link replaces the old one; take-down deletes the Cloudflare input", async () => {
  const old = a.hostUrl.split("#t=")[1];
  const r = await post(`/api/admin/streams/${a.streamId}/host-link`, {}, admin);
  assert.match(r.body.hostUrl, /#t=/);
  assert.equal((await get("/api/host/stream", { "X-Host-Token": old })).status, 401, "old link stops working");
  assert.equal((await get("/api/host/stream", { "X-Host-Token": r.body.hostUrl.split("#t=")[1] })).status, 200);
  const apps = (await get("/api/admin/streams", admin)).body.streams;
  assert.ok(!JSON.stringify(apps).includes("host_token_hash"));
  assert.equal((await post(`/api/admin/streams/${a.streamId}/reject`, {}, admin)).status, 200);
  assert.equal(inputs.get("in1").deleted, true);
  assert.equal((await get(`/api/streams/${a.streamId}`)).status, 404);
});

test("YouTube applicants keep their own link (no Cloudflare input)", async () => {
  const before = inputs.size;
  const y = (await post("/api/streams", { name: "Yuki", email: "y@example.com", title: "Tour", playbackUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).body;
  assert.equal(y.hostUrl, null);
  assert.equal(inputs.size, before);
  assert.equal((await get(`/api/streams/${y.streamId}`)).body.liveNow, true);
});
