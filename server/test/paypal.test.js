// Exercises the real (non-mock) PayPal code path against a fake PayPal API,
// checking the exact requests we send and how responses are parsed.
import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID = "cid";
process.env.PAYPAL_SECRET = "sec";
process.env.PAYPAL_ENV = "sandbox";
process.env.PAYPAL_WEBHOOK_ID = "WH-1";

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const path = new URL(url).pathname;
  const body = opts.body && opts.headers["Content-Type"] === "application/json" ? JSON.parse(opts.body) : opts.body;
  calls.push({ url, path, method: opts.method, headers: opts.headers, body });
  const json = (status, j) => ({ ok: status < 300, status, statusText: "", json: async () => j });
  if (path.includes("ORDER_BAD")) return json(422, { details: [{ description: "Order not approved" }] });
  if (path === "/v1/oauth2/token") return json(200, { access_token: "TOKEN", expires_in: 3600 });
  if (path === "/v2/checkout/orders") return json(201, { id: "ORDER1", status: "CREATED" });
  if (path.endsWith("/capture")) return json(201, { status: "COMPLETED", payer: { email_address: "m@x.co", name: { given_name: "Maria", surname: "Lopez" } }, purchase_units: [{ payments: { captures: [{ id: "CAP1", status: "COMPLETED" }] } }] });
  if (path.endsWith("/authorize")) return json(201, { status: "COMPLETED", payer: {}, purchase_units: [{ payments: { authorizations: [{ id: "AUTH1", expiration_time: "2026-10-26T00:00:00Z" }] } }] });
  if (path.endsWith("/void")) return json(204, {});
  if (path === "/v1/notifications/verify-webhook-signature") return json(200, { verification_status: body.transmission_sig === "good" ? "SUCCESS" : "FAILURE" });
  return json(404, {});
};

let pp;
before(async () => { pp = await import("../paypal.js"); });

test("create order: sandbox host, auth, totals and items", async () => {
  const o = await pp.createOrder({ intent: "CAPTURE", currency: "usd", customId: "local-1", description: "Matcha", items: [{ name: "Matcha", price: 30, qty: 1 }, { name: "Whisk", price: 18, qty: 1 }] });
  assert.equal(o.id, "ORDER1");
  assert.equal(o.total, 48);
  const tok = calls.find((c) => c.path === "/v1/oauth2/token");
  assert.equal(tok.headers.Authorization, "Basic " + Buffer.from("cid:sec").toString("base64"));
  const c = calls.find((c) => c.path === "/v2/checkout/orders");
  assert.match(c.url, /^https:\/\/api-m\.sandbox\.paypal\.com/);
  assert.equal(c.headers.Authorization, "Bearer TOKEN");
  assert.equal(c.headers["PayPal-Request-Id"], "create-local-1");
  const pu = c.body.purchase_units[0];
  assert.equal(c.body.intent, "CAPTURE");
  assert.deepEqual(pu.amount, { currency_code: "USD", value: "48.00", breakdown: { item_total: { currency_code: "USD", value: "48.00" } } });
  assert.equal(pu.items[1].unit_amount.value, "18.00");
  assert.equal(pu.custom_id, "local-1");
});

test("capture parses capture id + payer", async () => {
  const r = await pp.captureOrder("ORDER1");
  assert.equal(r.status, "COMPLETED");
  assert.equal(r.captureId, "CAP1");
  assert.equal(r.payer.first, "Maria");
  assert.equal(calls.filter((c) => c.path === "/v1/oauth2/token").length, 1, "token is cached");
});

test("hold: AUTHORIZE intent, no shipping, authorization id, void", async () => {
  await pp.createOrder({ intent: "AUTHORIZE", currency: "USD", customId: "h1", description: "Hold", items: [{ name: "Hold", price: 500, qty: 1 }] });
  const c = calls.filter((c) => c.path === "/v2/checkout/orders").at(-1);
  assert.equal(c.body.intent, "AUTHORIZE");
  assert.equal(c.body.application_context.shipping_preference, "NO_SHIPPING");
  const a = await pp.authorizeOrder("ORDER1");
  assert.equal(a.authorizationId, "AUTH1");
  assert.equal((await pp.voidAuthorization("AUTH1")).status, "VOIDED");
  assert.ok(calls.some((c) => c.path === "/v2/payments/authorizations/AUTH1/void"));
});

test("PayPal errors surface with the provider message", async () => {
  await assert.rejects(pp.captureOrder("ORDER_BAD"), /422: Order not approved/);
});

test("webhook verification uses PayPal's verify API", async () => {
  const h = { "paypal-auth-algo": "a", "paypal-cert-url": "u", "paypal-transmission-id": "i", "paypal-transmission-time": "t" };
  assert.equal(await pp.verifyWebhook({ ...h, "paypal-transmission-sig": "good" }, { id: "E" }), true);
  assert.equal(await pp.verifyWebhook({ ...h, "paypal-transmission-sig": "bad" }, { id: "E" }), false);
  const v = calls.at(-1);
  assert.equal(v.body.webhook_id, "WH-1");
});
