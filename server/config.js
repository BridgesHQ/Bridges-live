import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const env = process.env;
const key = (v) => String(v || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
const bool = (v, d) => (v == null || v === "" ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  port: Number(env.PORT || 3000),
  appUrl: env.APP_URL || `http://localhost:${env.PORT || 3000}`,
  supabase: {
    // tolerate common paste mistakes: spaces/quotes, trailing slash, "/rest/v1" suffix
    url: (env.SUPABASE_URL || "").trim().replace(/^["']|["']$/g, "").replace(/\/(rest\/v1\/?)?$/, "").replace(/\/+$/, ""),
    serviceKey: (env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^["']|["']$/g, ""),
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
    ownerEmail: env.LEAD_ALERT_EMAIL || "",          // where new-lead emails go
    fromName: env.LEAD_FROM_NAME || "Dorota Maslowska · Bridges Global",
    businessAddress: env.BUSINESS_ADDRESS || "",     // required in marketing emails (CAN-SPAM)
    sequence: bool(env.LEAD_SEQUENCE_ENABLED, true),
    unsubscribeSecret: env.UNSUBSCRIBE_SECRET || env.ADMIN_TOKEN || "dev-only-secret",
    whatsappNumber: "",                              // filled below from WHATSAPP_NUMBER or site-config.js
  },
  resend: {
    key: env.RESEND_API_KEY || "", from: env.RESEND_FROM || "",          // e.g. "Dorota <dd@bridgesglobal.co>" (verified domain)
    base: env.RESEND_API_BASE || "https://api.resend.com",
  },
  crm: {
    hubspotToken: env.HUBSPOT_TOKEN || env.HUBSPOT_ACCESS_TOKEN || "", hubspotBase: env.HUBSPOT_API_BASE || "https://api.hubapi.com",
    ghlWebhook: env.GHL_WEBHOOK_URL || "",            // GoHighLevel inbound-webhook workflow trigger
    webhook: env.CRM_WEBHOOK_URL || "",               // any other CRM / Zapier / Make
  },
  // Cloudflare Stream: one live input per approved agent (RTMPS/SRT ingest → HLS playback).
  cloudflare: {
    accountId: (env.CF_ACCOUNT_ID || "").trim(),
    token: (env.CF_STREAM_TOKEN || "").trim(),                // API token with "Stream: Edit"
    customerCode: (env.CF_SUBDOMAIN || env.CF_STREAM_CUSTOMER_CODE || "").trim().replace(/^https?:\/\//, "").replace(/^customer-/, "").replace(/\.cloudflarestream\.com.*$/, ""),
    apiBase: env.CF_API_BASE || "https://api.cloudflare.com/client/v4",
    deliveryBase: env.CF_DELIVERY_BASE || "",                  // tests only; default https://customer-<code>.cloudflarestream.com
    pollMs: Number(env.CF_POLL_MS || 20_000),
  },
  // Real listings, in priority order: Stellar MLS (Bridge Interactive RESO Web API) → RealtyAPI.
  // Lofty IDX has no reusable feed, so the site links out to your Lofty search instead.
  listings: {
    bridgeToken: key(env.BRIDGE_API_SERVER_TOKEN || env.BRIDGE_API_TOKEN),
    bridgeDataset: env.BRIDGE_DATASET || "stellar",
    bridgeBase: env.BRIDGE_API_BASE || "https://api.bridgedataoutput.com/api/v2/OData",
    realtyKey: key(env.REALTYAPI_KEY),
    realtyBase: env.REALTYAPI_BASE || "https://zillow.realtyapi.io",
    cities: (env.LISTING_CITIES || "Tampa;Riverview;Brandon;Apollo Beach;Wesley Chapel;Parrish;Lithia;Ruskin").split(/[;,]/).map((c) => c.trim()).filter(Boolean),
    max: Number(env.LISTING_MAX || 60),
    searchUrl: env.LOFTY_SEARCH_URL || "https://bridgesglobal.co",
  },
  // Social videos that fill the stream grid. Each platform turns on when its keys are present.
  social: {
    youtubeKey: key(env.YOUTUBE_API_KEY),
    youtubeChannel: key(env.YOUTUBE_CHANNEL_ID),        // UC… id, or
    youtubeHandle: key(env.YOUTUBE_HANDLE).replace(/^@?/, "@").replace(/^@$/, ""),
    youtubeBase: env.YOUTUBE_API_BASE || "https://www.googleapis.com/youtube/v3",
    instagramToken: key(env.INSTAGRAM_ACCESS_TOKEN),    // Instagram API with Instagram Login, long-lived (or use Connect)
    instagramAppId: key(env.INSTAGRAM_APP_ID),          // for the one-login "Connect Instagram" button
    instagramAppSecret: key(env.INSTAGRAM_APP_SECRET),
    instagramAuthBase: env.INSTAGRAM_AUTH_BASE || "https://www.instagram.com",
    instagramOAuthBase: env.INSTAGRAM_OAUTH_BASE || "https://api.instagram.com",
    instagramBase: env.INSTAGRAM_API_BASE || "https://graph.instagram.com",
    tiktokClientKey: key(env.TIKTOK_CLIENT_KEY),
    tiktokClientSecret: key(env.TIKTOK_CLIENT_SECRET),
    tiktokBase: env.TIKTOK_API_BASE || "https://open.tiktokapis.com",
    tiktokAuthBase: env.TIKTOK_AUTH_BASE || "https://www.tiktok.com",
    oembedTikTok: env.TIKTOK_OEMBED_BASE || "https://www.tiktok.com",
    max: Number(env.SOCIAL_MAX_PER_PLATFORM || 12),
  },
  // Demo property streams from seed data — off on the real site (clean empty state instead).
  // Today's Content: daily video scripts (Anthropic API). Without a key a built-in template is used.
  contentEmailHour: Number(env.CONTENT_EMAIL_HOUR || 7), // morning email of Today's Content (Tampa time)
  anthropic: {
    key: key(env.ANTHROPIC_API_KEY),
    model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
    baseURL: env.ANTHROPIC_BASE_URL || "", // tests only
  },
  // Optional AI video tool hook (server/content/video.js)
  video: { provider: (env.VIDEO_PROVIDER || "").trim().toLowerCase(), webhookUrl: env.VIDEO_WEBHOOK_URL || "", higgsfieldKey: env.HIGGSFIELD_API_KEY || "" },
  // Demo property streams from seed data — off on the real site (clean empty state instead).
  showSeedStreams: bool(env.SHOW_SEED_STREAMS, false),
  // Demo mode: grid shows the seeded audience size on top of real sockets (off = real viewers only).
  demoMode: bool(env.DEMO_MODE, false),
  autoApproveStreams: bool(env.AUTO_APPROVE_STREAMS, true),
  // Property reserve holds (PayPal authorization). Needs broker/attorney sign-off before live mode.
  holdsEnabled: bool(env.ENABLE_PROPERTY_HOLDS, false), // off until written hold terms exist
};

// WhatsApp number: one place to set it — assets/js/site-config.js (whatsappNumber) — or WHATSAPP_NUMBER.
{
  let n = env.WHATSAPP_NUMBER || "";
  if (!n) {
    try { n = (fs.readFileSync(path.join(config.root, "assets/js/site-config.js"), "utf8").match(/whatsappNumber:\s*"([^"]*)"/) || [])[1] || ""; } catch {}
  }
  const digits = n.replace(/\D/g, "");
  config.leads.whatsappNumber = digits.length === 10 ? `1${digits}` : digits.length >= 11 && digits.length <= 15 ? digits : "";
}

config.paypal.mode = config.paypal.clientId && config.paypal.secret ? config.paypal.env : "mock";
if (config.paypal.mode === "live" && config.holdsEnabled && !bool(env.HOLDS_LEGAL_SIGNOFF, false)) {
  console.warn("[config] Property holds disabled in live PayPal mode until HOLDS_LEGAL_SIGNOFF=true (broker/attorney review).");
  config.holdsEnabled = false;
}
