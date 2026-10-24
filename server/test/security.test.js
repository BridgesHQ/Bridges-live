// The privacy probe reads private tables with the PUBLIC key, like an outsider. Locked down → nothing
// readable; a table without RLS → reported by name.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const PORT = 4700 + Math.floor(Math.random() * 80);
let open = new Set(), seen = [], srv, probe;
before(async () => {
  srv = http.createServer((req, res) => {
    seen.push({ url: req.url, key: req.headers.apikey });
    const t = (req.url.match(/^\/rest\/v1\/(\w+)/) || [])[1];
    res.setHeader("Content-Type", "application/json");
    if (open.has(t)) return res.end(JSON.stringify([{ id: 1, email: "someone@example.com" }]));
    if (t === "users") { res.statusCode = 401; return res.end(JSON.stringify({ message: "permission denied" })); }
    res.end("[]"); // RLS on: no rows for the public key
  }).listen(PORT);
  process.env.SUPABASE_URL = `http://localhost:${PORT}`;
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  probe = (await import("../security.js")).publicReadProbe;
});
after(() => srv?.close());

test("locked down: the public key reads nothing", async () => {
  const r = await probe();
  assert.equal(r.ok, true, r.detail);
  assert.ok(seen.every((s) => s.key === "sb_publishable_test"), "only the public key is used");
  assert.ok(seen.some((s) => s.url.startsWith("/rest/v1/leads")));
});

test("a table without RLS is reported by name", async () => {
  open = new Set(["appointments", "leads"]);
  const r = await probe();
  assert.equal(r.ok, false);
  assert.deepEqual(r.exposed, ["appointments", "leads"]);
  assert.match(r.detail, /007_security_lockdown/);
});
