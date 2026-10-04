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
