// End-to-end: boots the server on a random port with a temp local DB, then drives
// the REST API + WebSocket exactly like the browser does (PayPal mock mode).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bl-"));
let proc;

const post = (p, body, headers = {}) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (p, headers = {}) => fetch(BASE + p, { headers }).then(async (r) => ({ status: r.status, body: await r.json() }));

function socket() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const seen = [];
  ws.on("message", (d) => seen.push(JSON.parse(d)));
  ws.waitFor = (pred, ms = 3000) => new Promise((ok, no) => {
    const t0 = Date.now();
    (function poll() {
      const m = seen.find(pred);
      if (m) return ok(m);
      if (Date.now() - t0 > ms) return no(new Error("timeout waiting for ws message; saw " + JSON.stringify(seen.map((s) => s.type))));
      setTimeout(poll, 25);
    })();
  });
  return new Promise((ok) => ws.on("open", () => ok(ws)));
}

before(async () => {
  // run from a temp copy root so the test DB never touches data/local-db.json
  proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), ADMIN_TOKEN: "t0ken", SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "", PAYPAL_CLIENT_ID: "", PAYPAL_SECRET: "", AUTO_APPROVE_STREAMS: "false", BL_LOCAL_DB: path.join(TMP, "db.json") },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => proc?.kill());

test("streams list includes matcha pilot first + property streams", async () => {
  const { body } = await get("/api/streams");
  assert.ok(body.streams.length > 20);
  assert.equal(body.streams[0].cta, "buy");
  assert.equal(body.streams[0].product.price, 30);
  assert.ok(body.streams.some((s) => s.cta === "showing"));
});

test("chat + viewer count + buy now → item_purchased broadcast", async () => {
  const { body } = await get("/api/streams");
  const matcha = body.streams[0];
  const a = await socket(), b = await socket(), lobby = await socket();
  lobby.send(JSON.stringify({ type: "lobby" }));
  a.send(JSON.stringify({ type: "join", streamId: matcha.id, name: "Ana" }));
  b.send(JSON.stringify({ type: "join", streamId: matcha.id, name: "Ben" }));
  const vc = await a.waitFor((m) => m.type === "viewer_count" && m.count === matcha.baselineViewers + 2);
  assert.ok(vc);
  await lobby.waitFor((m) => m.type === "counts" && m.counts[matcha.id] >= matcha.baselineViewers + 2);

  a.send(JSON.stringify({ type: "chat", body: "How much is the whisk?" }));
  const chat = await b.waitFor((m) => m.type === "chat_message" && m.name === "Ana");
  assert.equal(chat.intent, "price");

  b.send(JSON.stringify({ type: "chat", body: "cheap crypto at www.scam.com" }));
  const held = await b.waitFor((m) => m.type === "chat_message" && m.held);
  assert.ok(held);
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(!a.seen?.some?.((m) => m.body?.includes("scam")));

  // client-supplied prices are ignored: server prices from catalog
  const order = await post("/api/checkout", { streamId: matcha.id, addons: ["whisk", "bogus"], name: "Maria", price: 0.01 });
  assert.equal(order.status, 201);
  assert.equal(order.body.amount, 48);
  const cap = await post(`/api/checkout/${order.body.orderId}/capture`, {});
  assert.equal(cap.body.status, "paid");
  const evt = await b.waitFor((m) => m.type === "item_purchased");
  assert.equal(evt.buyerFirst, "Maria");
  assert.deepEqual(evt.addons, ["Bamboo whisk"]);
  await lobby.waitFor((m) => m.type === "item_purchased");
  // idempotent capture
  assert.equal((await post(`/api/checkout/${order.body.orderId}/capture`, {})).body.status, "paid");
  [a, b, lobby].forEach((w) => w.close());
});

test("property: request a showing + reserve hold (authorize) + admin void", async () => {
  const { body } = await get("/api/streams");
  const prop = body.streams.find((s) => s.cta === "showing");
  const w = await socket();
  w.send(JSON.stringify({ type: "join", streamId: prop.id, name: "Kai" }));
  await w.waitFor((m) => m.type === "history");

  assert.equal((await post("/api/showings", { streamId: prop.id, name: "Kai Lee", email: "bad" })).status, 400);
  const sh = await post("/api/showings", { streamId: prop.id, name: "Kai Lee", email: "kai@example.com", when: "Sat 10am" });
  assert.equal(sh.status, 201);
  assert.equal((await w.waitFor((m) => m.type === "showing_requested")).name, "Kai");

  assert.equal((await post("/api/holds", { streamId: prop.id, name: "Kai Lee", email: "kai@example.com" })).status, 400); // no agree
  assert.equal((await post("/api/checkout", { streamId: prop.id })).status, 400); // property isn't "buy now"
  const hold = await post("/api/holds", { streamId: prop.id, name: "Kai Lee", email: "kai@example.com", agree: true });
  assert.equal(hold.status, 201);
  assert.equal(hold.body.amount, 500);
  assert.equal((await post(`/api/holds/${hold.body.orderId}/authorize`, {})).body.status, "authorized");
  assert.match((await w.waitFor((m) => m.type === "hold_reserved")).title, new RegExp(prop.title.slice(0, 10)));

  assert.equal((await get("/api/admin/orders")).status, 401);
  const auth = { Authorization: "Bearer t0ken" };
  const orders = (await get("/api/admin/orders", auth)).body.orders;
  const h = orders.find((o) => o.kind === "hold");
  assert.equal(h.status, "authorized");
  assert.equal((await post(`/api/admin/holds/${h.id}/void`, {}, auth)).body.status, "voided");
  const lr = (await get("/api/admin/listingreel", auth)).body;
  assert.equal(lr.connected, false, "local DB has no ListingReel tables → explains instead of crashing");
  assert.match(lr.reason, /local test database/);
  const sum = (await get("/api/admin/summary", auth)).body;
  assert.equal(sum.purchases, 1);
  assert.ok(sum.leads >= 2);
  assert.ok(sum.intents.price >= 1);
  w.close();
});

test("lead form endpoint + go-live application → admin approve / take down", async () => {
  assert.equal((await post("/api/leads", { first_name: "Zoe", email: "zoe@example.com", source: "test" })).status, 201);
  const bad = await post("/api/streams", { name: "Host", email: "h@example.com", title: "Tour", playbackUrl: "http://evil" });
  assert.equal(bad.status, 400);
  const ok = await post("/api/streams", { name: "Host", email: "h@example.com", title: "My Tour", license: "SL123", playbackUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.status, "pending_review");
  assert.equal((await get(`/api/streams/${ok.body.streamId}`)).status, 404, "hidden until approved");
  const auth = { Authorization: "Bearer t0ken" };
  const apps = (await get("/api/admin/streams", auth)).body.streams;
  assert.equal(apps.find((a) => a.id === ok.body.streamId).license, "SL123");
  assert.equal((await post(`/api/admin/streams/${ok.body.streamId}/approve`, {}, auth)).status, 200);
  const s = await get(`/api/streams/${ok.body.streamId}`);
  assert.equal(s.body.title, "My Tour");
  assert.equal((await post(`/api/admin/streams/${ok.body.streamId}/reject`, {}, auth)).status, 200);
  assert.equal((await get(`/api/streams/${ok.body.streamId}`)).status, 404, "taken down");
});

test("static site served; private files are not", async () => {
  assert.equal((await fetch(BASE + "/live-marketplace/")).status, 200);
  for (const p of ["/listingreel/.env.example", "/listingreel/lib/env.ts", "/server/api.js", "/.env", "/data/local-db.json", "/backend/sql/schema.sql", "/package.json", "/docs/TECHNICAL_SPEC.md"]) {
    assert.equal((await fetch(BASE + p)).status, 404, p);
  }
});
