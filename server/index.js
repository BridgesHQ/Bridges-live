// Bridges Live server: serves the existing static site unchanged, plus /api and /ws.
//   npm install && npm run dev   →  http://localhost:3000
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { config } from "./config.js";
import { db } from "./db.js";
import { api } from "./api.js";
import { attachRealtime } from "./realtime.js";

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

// Never serve server code, secrets, data, or repo internals as static files.
const PRIVATE = /^\/(server|backend|data|node_modules|functions|docs)(\/|$)|^\/\.|\/\.|\.(txt|md|json|sql|ts|tsx|lock)$/i;
const PUBLIC_FILES = new Set(["/robots.txt", "/llms.txt", "/sitemap.xml"]);
app.use((req, res, next) => (PRIVATE.test(req.path) && !PUBLIC_FILES.has(req.path) ? res.status(404).end() : next()));

app.use(express.static(config.root, { extensions: ["html"], index: "index.html", dotfiles: "deny", maxAge: "5m" }));
app.use((req, res) => {
  res.status(404);
  const home = path.join(config.root, "index.html");
  req.accepts("html") && fs.existsSync(home) ? res.sendFile(home) : res.end();
});

const server = http.createServer(app);
attachRealtime(server);
server.listen(config.port, () => {
  console.log(`\n  Bridges Live → ${config.appUrl}`);
  console.log(`  database: ${db.kind}${db.kind === "local" ? " (data/local-db.json — set SUPABASE_URL + SUPABASE_SERVICE_KEY for Supabase)" : ""}`);
  console.log(`  paypal:   ${config.paypal.mode}${config.paypal.mode === "mock" ? " (simulator — set PAYPAL_CLIENT_ID + PAYPAL_SECRET for sandbox)" : ""}`);
  console.log(`  holds:    ${config.holdsEnabled ? "enabled" : "disabled"} · demo mode: ${config.demoMode}\n`);
});
