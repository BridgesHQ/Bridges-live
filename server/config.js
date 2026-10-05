import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
const bool = (v, d) => (v == null || v === "" ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  port: Number(env.PORT || 3000),
  appUrl: env.APP_URL || `http://localhost:${env.PORT || 3000}`,
  supabase: {
    url: env.SUPABASE_URL || "",
    serviceKey: env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "",
    databaseUrl: env.DATABASE_URL || "",
  },
  paypal: {
    clientId: env.PAYPAL_CLIENT_ID || "",
    secret: env.PAYPAL_SECRET || env.PAYPAL_CLIENT_SECRET || "",
    webhookId: env.PAYPAL_WEBHOOK_ID || "",
    // sandbox | live. "mock" is used automatically when no keys are set.
    env: env.PAYPAL_ENV || "sandbox",
  },
  adminToken: env.ADMIN_TOKEN || "",
  cronSecret: env.CRON_SECRET || "",
  // ---- lead pipeline (each integration switches on when its keys are present) ----
  leads: {
    ownerPhone: env.LEAD_ALERT_PHONE || "",          // your mobile, E.164 (+18135551234)
    ownerEmail: env.LEAD_ALERT_EMAIL || "",          // where new-lead emails go
    fromName: env.LEAD_FROM_NAME || "Dorota Maslowska · Bridges Global",
    businessAddress: env.BUSINESS_ADDRESS || "",     // required in marketing emails (CAN-SPAM)
    // automatic texts TO LEADS need Twilio A2P 10DLC registration — off until you turn it on
    smsToLeads: bool(env.LEAD_SMS_TO_LEADS, false),
    sequence: bool(env.LEAD_SEQUENCE_ENABLED, true),
    unsubscribeSecret: env.UNSUBSCRIBE_SECRET || env.ADMIN_TOKEN || "dev-only-secret",
  },
  twilio: {
    sid: env.TWILIO_ACCOUNT_SID || "", token: env.TWILIO_AUTH_TOKEN || "", from: env.TWILIO_FROM || "",
    base: env.TWILIO_API_BASE || "https://api.twilio.com",
  },
  resend: {
    key: env.RESEND_API_KEY || "", from: env.RESEND_FROM || "",          // e.g. "Dorota <dd@bridgesglobal.co>" (verified domain)
    base: env.RESEND_API_BASE || "https://api.resend.com",
  },
  crm: {
    hubspotToken: env.HUBSPOT_TOKEN || "", hubspotBase: env.HUBSPOT_API_BASE || "https://api.hubapi.com",
    ghlWebhook: env.GHL_WEBHOOK_URL || "",            // GoHighLevel inbound-webhook workflow trigger
    webhook: env.CRM_WEBHOOK_URL || "",               // any other CRM / Zapier / Make
  },
  // Demo mode: grid shows the seeded audience size on top of real sockets.
  demoMode: bool(env.DEMO_MODE, true),
  autoApproveStreams: bool(env.AUTO_APPROVE_STREAMS, true),
  // Property reserve holds (PayPal authorization). Needs broker/attorney sign-off before live mode.
  holdsEnabled: bool(env.ENABLE_PROPERTY_HOLDS, true),
};

config.paypal.mode = config.paypal.clientId && config.paypal.secret ? config.paypal.env : "mock";
if (config.paypal.mode === "live" && config.holdsEnabled && !bool(env.HOLDS_LEGAL_SIGNOFF, false)) {
  console.warn("[config] Property holds disabled in live PayPal mode until HOLDS_LEGAL_SIGNOFF=true (broker/attorney review).");
  config.holdsEnabled = false;
}
