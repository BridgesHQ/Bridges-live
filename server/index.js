// Bridges Live server: serves the existing static site unchanged, plus /api and /ws.
//   npm install && npm run dev   →  http://localhost:3000
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { config } from "./config.js";
import { db, checkDatabase } from "./db.js";
import { api } from "./api.js";
import { attachRealtime } from "./realtime.js";
import { startFollowupScheduler } from "./leads/sequence.js";
import { integrations } from "./leads/providers.js";
import { startStreamMonitor } from "./stream/monitor.js";
import { cloudflareEnabled } from "./stream/cloudflare.js";
import { ratingJsonLd } from "./reviews.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN" });
  next();
});

// Cross-origin API use (e.g. static pages on Cloudflare Pages, API elsewhere): CORS_ORIGINS=https://a,https://b
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use("/api", (req, res, next) => {
  const origin = req.get("origin");
  if (origin && corsOrigins.includes(origin)) {
    res.set({ "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" });
    if (req.method === "OPTIONS") return res.status(204).end();
  }
  next();
});
app.use("/api", api);

// Retired pages (the site is real estate only) — permanent redirects so old links keep working.
const RETIRED = {
  "/matcha": "/live-marketplace", "/global-trade": "/",
  "/blog/best-ceremonial-matcha-guide": "/blog/", "/blog/best-of-japan-uji-matcha": "/blog/",
  "/builder-dashboard": "/list-with-us",
};
app.use((req, res, next) => {
  const to = RETIRED[req.path.replace(/\/(index\.html)?$/, "") || "/"];
  return to ? res.redirect(301, to) : next();
});

// Never serve server code, secrets, data, or repo internals as static files.
const PRIVATE = /^\/(server|backend|data|node_modules|functions|docs|listingreel)(\/|$)|^\/\.|\/\.|^\/_(headers|redirects)$|\.(txt|md|json|sql|ts|tsx|lock|ya?ml|env|example|bundle|sh)$/i;
const PUBLIC_FILES = new Set(["/robots.txt", "/llms.txt", "/sitemap.xml"]);
app.use((req, res, next) => (PRIVATE.test(req.path) && !PUBLIC_FILES.has(req.path) ? res.status(404).end() : next()));

// Private dashboards: never cached, never indexed. /admin needs ADMIN_TOKEN for every API call; /go-live
// needs a host link and only ever shows that host's own stream.
app.use(["/admin", "/go-live"], (req, res, next) => { res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" }); next(); });

// Pages with a <!--bl:rating--> slot get the Yelp AggregateRating schema filled in server-side (real figures only).
const RATED = { "/": "index.html", "/index.html": "index.html", "/dorota-maslowska": "dorota-maslowska/index.html", "/dorota-maslowska/": "dorota-maslowska/index.html" };
app.get(Object.keys(RATED), async (req, res, next) => {
  try {
    const html = fs.readFileSync(path.join(config.root, RATED[req.path]), "utf8");
    if (!html.includes("<!--bl:rating-->")) return next();
    res.type("html").set("Cache-Control", "public, max-age=300").send(html.replace("<!--bl:rating--><!--/bl:rating-->", await ratingJsonLd()));
  } catch { next(); }
});

app.use(express.static(config.root, { extensions: ["html"], index: "index.html", dotfiles: "deny", maxAge: "5m" }));
app.use((req, res) => {
  res.status(404);
  const home = path.join(config.root, "index.html");
  req.accepts("html") && fs.existsSync(home) ? res.sendFile(home) : res.end();
});

const server = http.createServer(app);
attachRealtime(server);
const dbStatus = await checkDatabase();
if (process.env.NODE_ENV !== "test") startFollowupScheduler();
startStreamMonitor();
server.listen(config.port, () => {
  console.log(`\n  Bridges Live → ${config.appUrl}`);
  console.log(`  database: ${dbStatus}${db.kind === "local" && dbStatus === "local" ? " (data/local-db.json — set SUPABASE_URL + SUPABASE_SERVICE_KEY for Supabase)" : ""}`);
  console.log(`  paypal:   ${config.paypal.mode}${config.paypal.mode === "mock" ? " (simulator — set PAYPAL_CLIENT_ID + PAYPAL_SECRET for sandbox)" : ""}`);
  console.log(`  demo mode: ${config.demoMode}`);
  console.log(`  video:    cloudflare stream ${cloudflareEnabled() ? "on — agents get their own live input" : "off (set CF_ACCOUNT_ID, CF_STREAM_TOKEN, CF_SUBDOMAIN)"}`);
  const i = integrations();
  console.log(`  leads:    email alerts ${i.email && i.alertsTo.email ? "on" : "off"} · crm ${i.crm.join("+") || "off"} · whatsapp ${i.whatsapp ? "on" : "off (set whatsappNumber in assets/js/site-config.js)"}\n`);
});
