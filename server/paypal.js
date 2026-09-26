// PayPal Orders v2 over plain REST (no SDK). Sandbox by default.
// With no PAYPAL_CLIENT_ID/PAYPAL_SECRET the module runs in "mock" mode so the whole
// checkout loop can be tested locally; the browser shows a sandbox simulator instead.
import crypto from "node:crypto";
import { config } from "./config.js";

const BASE = { sandbox: "https://api-m.sandbox.paypal.com", live: "https://api-m.paypal.com" };
const mock = () => config.paypal.mode === "mock";
const money = (n) => Number(n).toFixed(2);

let token = { value: null, exp: 0 };
async function accessToken() {
  if (token.value && Date.now() < token.exp - 60_000) return token.value;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.secret}`).toString("base64");
  const r = await fetch(`${BASE[config.paypal.mode]}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PayPal auth failed (${r.status}): ${j.error_description || j.error || "unknown"}`);
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function call(method, path, body, requestId) {
  const r = await fetch(`${BASE[config.paypal.mode]}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = j.details?.[0]?.description || j.message || r.statusText;
    const err = new Error(`PayPal ${method} ${path} → ${r.status}: ${detail}`);
    err.status = r.status; err.body = j;
    throw err;
  }
  return j;
}

/**
 * @param {{intent:'CAPTURE'|'AUTHORIZE', currency:string, items:{name:string,price:number,qty:number}[], description:string, customId:string}} o
 */
export async function createOrder(o) {
  const total = o.items.reduce((s, i) => s + i.price * i.qty, 0);
  if (mock()) return { id: `MOCK-${crypto.randomBytes(6).toString("hex").toUpperCase()}`, status: "CREATED", total };
  const cc = o.currency.toUpperCase();
  const order = await call("POST", "/v2/checkout/orders", {
    intent: o.intent,
    purchase_units: [{
      reference_id: o.customId,
      custom_id: o.customId,
      description: o.description.slice(0, 127),
      amount: { currency_code: cc, value: money(total), breakdown: { item_total: { currency_code: cc, value: money(total) } } },
      items: o.items.map((i) => ({ name: i.name.slice(0, 127), quantity: String(i.qty), unit_amount: { currency_code: cc, value: money(i.price) } })),
    }],
    application_context: { brand_name: "Bridges Live", shipping_preference: o.intent === "AUTHORIZE" ? "NO_SHIPPING" : "GET_FROM_FILE", user_action: "PAY_NOW" },
  }, `create-${o.customId}`);
  return { id: order.id, status: order.status, total };
}

function payerOf(res) {
  const p = res.payer || {};
  return { email: p.email_address || null, first: p.name?.given_name || null, last: p.name?.surname || null };
}

export async function captureOrder(orderId) {
  if (mock()) return { status: "COMPLETED", captureId: `MOCKCAP-${orderId.slice(5)}`, payer: {} };
  const res = await call("POST", `/v2/checkout/orders/${orderId}/capture`, {}, `capture-${orderId}`);
  const cap = res.purchase_units?.[0]?.payments?.captures?.[0];
  return { status: cap?.status === "COMPLETED" ? "COMPLETED" : res.status, captureId: cap?.id || null, payer: payerOf(res), raw: res };
}

export async function authorizeOrder(orderId) {
  if (mock()) return { status: "COMPLETED", authorizationId: `MOCKAUTH-${orderId.slice(5)}`, payer: {} };
  const res = await call("POST", `/v2/checkout/orders/${orderId}/authorize`, {}, `authorize-${orderId}`);
  const auth = res.purchase_units?.[0]?.payments?.authorizations?.[0];
  return { status: res.status, authorizationId: auth?.id || null, expires: auth?.expiration_time || null, payer: payerOf(res), raw: res };
}

export async function voidAuthorization(authorizationId) {
  if (mock()) return { status: "VOIDED" };
  await call("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, `void-${authorizationId}`);
  return { status: "VOIDED" };
}

/** Verify a webhook with PayPal's verify-webhook-signature API. */
export async function verifyWebhook(headers, event) {
  if (mock() || !config.paypal.webhookId) return false;
  const res = await call("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"], transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"], webhook_id: config.paypal.webhookId, webhook_event: event,
  });
  return res.verification_status === "SUCCESS";
}
