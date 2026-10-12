// Real listings (Stellar MLS via Bridge, RealtyAPI fallback) and social videos (YouTube,
// Instagram, TikTok) filling the stream slots — against fake provider APIs. Also Cloudflare
// recordings download. Nothing shown is invented: LIVE only for real lives.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 4700 + Math.floor(Math.random() * 80), FAKE = PORT + 100, BASE = `http://localhost:${PORT}`, F = `http://localhost:${FAKE}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bl-feeds-"));
const calls = [];
let fake, proc, ytLive = true, igToken = "IGTOKEN";
const auth = { Authorization: "Bearer t0ken", "Content-Type": "application/json" };
const post = (p, body, h = auth) => fetch(BASE + p, { method: "POST", headers: h, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const get = (p, h = auth) => fetch(BASE + p, { headers: h, redirect: "manual" }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => ({})) }));
const json = (res, o, code = 200) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };

const RESO = (k, price, city, office, photos = 2) => ({ ListingKey: k, ListingId: "T" + k, StandardStatus: "Active", ListPrice: price, UnparsedAddress: `${k} Bay Dr`, City: city, StateOrProvince: "FL", PostalCode: "33569",
  BedroomsTotal: 3, BathroomsTotalInteger: 2, LivingArea: 1800, PropertyType: "Residential", PropertySubType: "Single Family Residence", ListOfficeName: office, ModificationTimestamp: "2026-10-1" + k.slice(-1) + "T10:00:00Z",
  Media: Array.from({ length: photos }, (_, i) => ({ MediaURL: `https://photos.example/${k}-${i}.jpg`, Order: i })) });

before(async () => {
  fake = http.createServer((req, res) => {
    let raw = ""; req.on("data", (d) => (raw += d)); req.on("end", () => {
      const u = new URL(req.url, F); calls.push({ method: req.method, path: u.pathname, q: Object.fromEntries(u.searchParams), headers: req.headers, raw });
      // Bridge RESO Web API
      if (u.pathname === "/bridge/stellar/Property") {
        if (req.headers.authorization !== "Bearer BRIDGE-TOKEN") return json(res, { error: { message: "bad token" } }, 401);
        return json(res, { value: [RESO("1001", 450000, "Riverview", "Sunshine Realty"), RESO("1002", 615000, "Brandon", "LPT Realty"), RESO("1003", 0, "Tampa", "No Price Inc")] });
      }
      // YouTube Data API
      if (u.pathname === "/yt/channels") return json(res, { items: [{ id: "UC123", contentDetails: { relatedPlaylists: { uploads: "UU123" } } }] });
      if (u.pathname === "/yt/playlistItems") return json(res, { items: [{ contentDetails: { videoId: "vidLIVE0001" } }, { contentDetails: { videoId: "vidTOUR0002" } }] });
      if (u.pathname === "/yt/videos") return json(res, { items: [
        { id: "vidLIVE0001", snippet: { title: "Sunday open house LIVE", liveBroadcastContent: ytLive ? "live" : "none", publishedAt: "2026-10-12T15:00:00Z", thumbnails: { high: { url: "https://i.ytimg.com/vi/vidLIVE0001/hq.jpg" } } }, liveStreamingDetails: { concurrentViewers: "17", actualStartTime: "2026-10-12T15:00:00Z" }, status: { embeddable: true, privacyStatus: "public" } },
        { id: "vidTOUR0002", snippet: { title: "Model home tour — Riverview", liveBroadcastContent: "none", publishedAt: "2026-10-10T12:00:00Z", thumbnails: { high: { url: "https://i.ytimg.com/vi/vidTOUR0002/hq.jpg" } } }, status: { embeddable: true, privacyStatus: "public" } },
      ] });
      // Instagram
      if (u.pathname === "/ig/refresh_access_token") return json(res, { access_token: (igToken = "IGTOKEN2"), expires_in: 5184000 });
      if (u.pathname === "/ig/me/media") {
        if (u.searchParams.get("access_token") !== igToken) return json(res, { error: { message: "bad ig token" } }, 400);
        return json(res, { data: [
          { id: "ig1", caption: "Waterfront reel 🌊", media_type: "VIDEO", media_product_type: "REELS", media_url: "https://cdn.ig/ig1.mp4", thumbnail_url: "https://cdn.ig/ig1.jpg", permalink: "https://www.instagram.com/reel/ig1/", timestamp: "2026-10-11T12:00:00+0000" },
          { id: "ig2", caption: "photo", media_type: "IMAGE", media_url: "https://cdn.ig/ig2.jpg", permalink: "https://www.instagram.com/p/ig2/", timestamp: "2026-10-11T13:00:00+0000" },
        ] });
      }
      // TikTok
      if (u.pathname === "/tt/v2/oauth/token/") { const p = new URLSearchParams(raw); return json(res, { access_token: "TT-ACCESS", refresh_token: "TT-REFRESH", expires_in: 86400, open_id: "o1", grant: p.get("grant_type") }); }
      if (u.pathname === "/tt/v2/video/list/") return req.headers.authorization === "Bearer TT-ACCESS" ? json(res, { data: { videos: [{ id: "7300001", title: "New build walkthrough", cover_image_url: "https://p16.tiktok/c.jpg", share_url: "https://www.tiktok.com/@realtor_dorota/video/7300001", create_time: 1760300000 }] } }) : json(res, { error: { code: "access_token_invalid" } }, 401);
      if (u.pathname === "/tt/oembed") return json(res, { title: "Pasted TikTok", thumbnail_url: "https://p16.tiktok/pasted.jpg" });
      // Cloudflare Stream
      if (u.pathname === "/cf/client/v4/accounts/acc1/stream/live_inputs" && req.method === "POST") return json(res, { success: true, result: { uid: "inOWN", rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "key-own" } } });
      if (u.pathname === "/cf/client/v4/accounts/acc1/stream/live_inputs/inOWN") return json(res, { success: true, result: { uid: "inOWN", rtmps: { url: "rtmps://live.cloudflare.com:443/live/", streamKey: "key-own" } } });
      if (u.pathname === "/cf/client/v4/accounts/acc1/stream/live_inputs/inOWN/videos") return json(res, { success: true, result: [{ uid: "rec1", created: "2026-10-11T18:00:00Z", duration: 1260, readyToStream: true }] });
      if (u.pathname === "/cf/client/v4/accounts/acc1/stream/rec1/downloads") return req.method === "POST" ? json(res, { success: true, result: { default: { status: "inprogress", percentComplete: 10 } } }) : json(res, { success: false, errors: [{ message: "not found" }] }, 404);
      if (/^\/cfd\/\w+\/lifecycle$/.test(u.pathname)) return json(res, { live: false });
      json(res, { error: "not found" }, 404);
    });
  }).listen(FAKE);
  proc = spawn(process.execPath, ["server/index.js"], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", ADMIN_TOKEN: "t0ken", CRON_SECRET: "cron-secret-123456", SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "", BL_LOCAL_DB: path.join(TMP, "db.json"), APP_URL: BASE,
      DEMO_MODE: "false", SHOW_SEED_STREAMS: "false", ENABLE_PROPERTY_HOLDS: "false", ANTHROPIC_API_KEY: "", RESEND_API_KEY: "", HUBSPOT_TOKEN: "",
      BRIDGE_API_SERVER_TOKEN: "BRIDGE-TOKEN", BRIDGE_API_BASE: `${F}/bridge`, LISTING_CITIES: "Riverview;Brandon;Tampa", REALTYAPI_KEY: "",
      YOUTUBE_API_KEY: "YT-KEY", YOUTUBE_HANDLE: "@realtordorota", YOUTUBE_API_BASE: `${F}/yt`,
      INSTAGRAM_ACCESS_TOKEN: "IGTOKEN", INSTAGRAM_API_BASE: `${F}/ig`,
      TIKTOK_CLIENT_KEY: "tt-key", TIKTOK_CLIENT_SECRET: "tt-secret", TIKTOK_API_BASE: `${F}/tt`, TIKTOK_AUTH_BASE: "https://www.tiktok.com", TIKTOK_OEMBED_BASE: `${F}/tt`,
      CF_ACCOUNT_ID: "acc1", CF_STREAM_TOKEN: "cf", CF_SUBDOMAIN: "abc", CF_API_BASE: `${F}/cf/client/v4`, CF_DELIVERY_BASE: `${F}/cfd`, CF_POLL_MS: "60000" },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server did not start");
});
after(() => { proc?.kill(); fake?.close(); });

test("Stellar MLS listings: IDX filter, bearer token, brokerage attribution, no unpriced rows", async () => {
  const r = await post("/api/admin/listings/sync", {});
  assert.equal(r.body.ok, true);
  assert.equal(r.body.source, "stellar-mls");
  const c = calls.find((x) => x.path === "/bridge/stellar/Property");
  assert.equal(c.headers.authorization, "Bearer BRIDGE-TOKEN");
  assert.match(c.q.$filter, /InternetEntireListingDisplayYN eq true/);
  assert.match(c.q.$filter, /StandardStatus eq 'Active'/);
  assert.match(c.q.$filter, /City eq 'Riverview'/);
  const l = (await get("/api/listings", {})).body;
  assert.equal(l.source, "stellar-mls");
  assert.equal(l.listings.length, 2, "listing without a price is never shown");
  const a = l.listings.find((x) => x.address === "1001 Bay Dr");
  assert.equal(a.price, 450000);
  assert.equal(a.listOffice, "Sunshine Realty");
  assert.equal(a.mlsNumber, "T1001");
  assert.equal(a.photos.length, 2);
  assert.match(l.attribution, /Stellar MLS/);
});

test("social sync: YouTube live counts as LIVE with real viewers; Instagram reels play; images skipped; token refreshed", async () => {
  const r = await post("/api/admin/social/sync", {});
  assert.equal(r.body.youtube.count, 2, JSON.stringify(r.body));
  assert.equal(r.body.instagram.count, 1, "only videos");
  assert.equal(r.body.tiktok.count, 0, "TikTok not connected yet → no videos");
  const ch = calls.find((x) => x.path === "/yt/channels");
  assert.equal(ch.q.forHandle, "@realtordorota"); assert.equal(ch.q.key, "YT-KEY");
  assert.ok(calls.some((x) => x.path === "/ig/refresh_access_token"), "Instagram token auto-refreshed");
  const s = (await get("/api/slots", {})).body;
  assert.equal(s.liveCount, 1);
  assert.equal(s.slots[0].kind, "live");
  assert.equal(s.slots[0].source, "youtube");
  assert.equal(s.slots[0].viewers, 17, "real YouTube concurrent viewers");
  assert.match(s.slots[0].video.embedUrl, /youtube\.com\/embed\/vidLIVE0001/);
  const ig = s.slots.find((x) => x.video?.platform === "instagram");
  assert.equal(ig.kind, "video"); assert.equal(ig.video.mediaUrl, "https://cdn.ig/ig1.mp4"); assert.equal(ig.video.playable, true);
  assert.ok(s.slots.every((x) => x.kind !== "live" || x.viewers != null), "no LIVE tile without a real count");
  // when YouTube says it's over, the LIVE badge goes away on the next sync
  ytLive = false; await post("/api/admin/social/sync", {});
  assert.equal((await get("/api/slots", {})).body.liveCount, 0);
});

test("TikTok: OAuth connect (signed state), token exchange, cover + Watch (not playable)", async () => {
  const c = (await post("/api/admin/social/tiktok/connect", {})).body;
  const u = new URL(c.url);
  assert.equal(u.searchParams.get("client_key"), "tt-key");
  assert.match(u.searchParams.get("scope"), /video\.list/);
  assert.equal((await get("/api/social/tiktok/callback?code=abc&state=forged.123", {})).status, 400, "forged state rejected");
  const cb = await get(`/api/social/tiktok/callback?code=abc&state=${encodeURIComponent(u.searchParams.get("state"))}`, {});
  assert.equal(cb.status, 302);
  const tok = calls.find((x) => x.path === "/tt/v2/oauth/token/");
  assert.match(tok.raw, /grant_type=authorization_code/); assert.match(tok.raw, /client_secret=tt-secret/);
  const tt = (await get("/api/slots?n=24", {})).body.slots.find((x) => x.video?.platform === "tiktok");
  assert.equal(tt.video.playable, false, "TikTok blocks embedding → cover + Watch");
  assert.match(tt.video.permalink, /tiktok\.com\/@realtor_dorota\/video\/7300001/);
});

test("admin: add a video by link, hide a video, bad links rejected", async () => {
  assert.equal((await post("/api/admin/social/add", { url: "https://evil.example/x" })).status, 400);
  const yt = (await post("/api/admin/social/add", { url: "https://youtu.be/dQw4w9WgXcQ" })).body.video;
  assert.equal(yt.embed_url, "https://www.youtube.com/embed/dQw4w9WgXcQ");
  const tk = (await post("/api/admin/social/add", { url: "https://www.tiktok.com/@realtor_dorota/video/7311111" })).body.video;
  assert.equal(tk.title, "Pasted TikTok"); assert.equal(tk.thumbnail, "https://p16.tiktok/pasted.jpg");
  await post(`/api/admin/social/${encodeURIComponent("instagram:ig1")}`, { hidden: true });
  const slots = (await get("/api/slots?n=24", {})).body.slots;
  assert.ok(!slots.some((x) => x.video?.id === "instagram:ig1"), "hidden video is off the site");
  assert.ok(slots.some((x) => x.video?.id === "youtube:dQw4w9WgXcQ"));
  assert.equal((await get("/api/admin/social", {})).status, 401);
});

test("recordings: list, prepare MP4 download, publish replay to the grid", async () => {
  await post("/api/admin/my-live", { mode: "cloudflare", title: "Saturday tour" });
  const r = (await get("/api/admin/recordings")).body;
  assert.equal(r.enabled, true);
  assert.equal(r.recordings[0].uid, "rec1");
  assert.equal(r.recordings[0].download.status, "none");
  assert.match(r.recordings[0].watchUrl, /rec1\/watch$/);
  const d = (await post("/api/admin/recordings/rec1/download", {})).body;
  assert.equal(d.status, "inprogress");
  await post("/api/admin/recordings/rec1/publish", { title: "Replay: Saturday tour" });
  const v = (await get("/api/slots?n=24", {})).body.slots.find((x) => x.video?.id === "bridges:rec1");
  assert.equal(v.kind, "video"); assert.match(v.video.embedUrl, /rec1\/iframe$/);
  // the owner's stream is on the grid as "starts soon" (not LIVE) until the phone actually streams
  const own = (await get("/api/slots?n=24", {})).body.slots.find((x) => x.stream?.owner);
  assert.equal(own.kind, "upcoming");
});

test("setup lists listing + social connections; holds hidden by default", async () => {
  const items = Object.fromEntries((await get("/api/admin/setup")).body.items.map((i) => [i.key, i]));
  assert.equal(items.listings.ok, true, JSON.stringify(items)); assert.equal(items.youtube.ok, true); assert.equal(items.instagram.ok, true); assert.equal(items.holds.ok, true);
  assert.equal((await get("/api/config", {})).body.holds.enabled, false, "Reserve hold hidden until terms exist");
});
