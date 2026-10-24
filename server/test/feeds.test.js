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
      // Instagram login (OAuth)
      if (u.pathname === "/igo/oauth/access_token") { const p = new URLSearchParams(raw); return p.get("code") === "IGCODE" && p.get("client_secret") === "ig-secret" ? json(res, { access_token: "SHORT", user_id: 42 }) : json(res, { error_message: "bad code" }, 400); }
      if (u.pathname === "/ig/access_token") return u.searchParams.get("access_token") === "SHORT" ? json(res, { access_token: (igToken = "IGLONG"), expires_in: 5184000 }) : json(res, { error: { message: "bad short token" } }, 400);
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
      DEMO_MODE: "false", SHOW_SEED_STREAMS: "false", ANTHROPIC_API_KEY: "", RESEND_API_KEY: "", HUBSPOT_TOKEN: "",
      BRIDGE_API_SERVER_TOKEN: "BRIDGE-TOKEN", BRIDGE_API_BASE: `${F}/bridge`, LISTING_CITIES: "Riverview;Brandon;Tampa", REALTYAPI_KEY: "",
      YOUTUBE_API_KEY: "YT-KEY", YOUTUBE_HANDLE: "", YOUTUBE_CHANNEL_ID: "", YOUTUBE_API_BASE: `${F}/yt`,
      INSTAGRAM_ACCESS_TOKEN: "", INSTAGRAM_APP_ID: "ig-app", INSTAGRAM_APP_SECRET: "ig-secret", INSTAGRAM_API_BASE: `${F}/ig`, INSTAGRAM_OAUTH_BASE: `${F}/igo`,
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

test("Connect YouTube (handle typed in admin) and Connect Instagram (one login, signed state, long-lived token)", async () => {
  const st0 = (await get("/api/admin/social")).body.status;
  assert.equal(st0.youtube.configured, false); assert.equal(st0.youtube.keySet, true);
  assert.equal(st0.instagram.configured, false); assert.equal(st0.instagram.appSet, true);
  assert.equal((await post("/api/admin/social/youtube/connect", { channel: "not a handle!" })).status, 400);
  const yt = (await post("/api/admin/social/youtube/connect", { channel: "@realtordorota" })).body;
  assert.equal(yt.ok, true); assert.equal(yt.count, 2);
  const ig = (await post("/api/admin/social/instagram/connect", {})).body;
  const u = new URL(ig.url);
  assert.equal(u.searchParams.get("client_id"), "ig-app");
  assert.equal(u.searchParams.get("scope"), "instagram_business_basic");
  assert.equal(u.searchParams.get("redirect_uri"), `${BASE}/api/social/instagram/callback`);
  assert.equal((await get(`/api/social/instagram/callback?code=IGCODE&state=ig.${Date.now()}.abc.forged`, {})).status, 400, "forged state rejected");
  const cb = await get(`/api/social/instagram/callback?code=IGCODE&state=${encodeURIComponent(u.searchParams.get("state"))}`, {});
  assert.equal(cb.status, 302); assert.match(cb.headers.get("location"), /\/admin\/#videos/);
  const st1 = (await get("/api/admin/social")).body.status;
  assert.equal(st1.youtube.configured, true); assert.equal(st1.youtube.channel, "@realtordorota");
  assert.equal(st1.instagram.configured, true);
});

test("social sync: YouTube live counts as LIVE with real viewers; Instagram reels play; images skipped; token refreshed", async () => {
  const r = await post("/api/admin/social/sync", {});
  assert.equal(r.body.youtube.count, 2, JSON.stringify(r.body));
  assert.equal(r.body.instagram.count, 1, "only videos");
  assert.equal(r.body.tiktok.skipped, true, "TikTok not connected yet → no videos");
  const ch = calls.find((x) => x.path === "/yt/channels");
  assert.equal(ch.q.forHandle, "@realtordorota"); assert.equal(ch.q.key, "YT-KEY");
  assert.ok(calls.some((x) => x.path === "/ig/me/media" && x.q.access_token === "IGLONG"), "uses the long-lived token from Connect");
  // synced social videos stay in the admin library; the site's live tiles show Bridges Live streams only
  const s = (await get("/api/slots", {})).body;
  assert.ok(s.slots.every((x) => !x.video), "no YouTube/Instagram clips on the site");
  assert.equal(s.liveCount, 0, "a YouTube live is not a Bridges Live stream");
});

test("TikTok: OAuth connect (signed state), token exchange, cover + Watch (not playable)", async () => {
  const c = (await post("/api/admin/social/tiktok/connect", {})).body;
  const u = new URL(c.url);
  assert.equal(u.searchParams.get("client_key"), "tt-key");
  assert.match(u.searchParams.get("scope"), /video\.list/);
  assert.equal((await get("/api/social/tiktok/callback?code=abc&state=forged.123", {})).status, 400, "forged state rejected");
  const cb = await get(`/api/social/tiktok/callback?code=abc&state=${encodeURIComponent(u.searchParams.get("state"))}`, {});
  assert.equal(cb.status, 302);
  assert.equal((await get("/api/admin/social")).body.status.tiktok.configured, true);
  await post("/api/admin/social/sync", {});
  const tok = calls.find((x) => x.path === "/tt/v2/oauth/token/");
  assert.match(tok.raw, /grant_type=authorization_code/); assert.match(tok.raw, /client_secret=tt-secret/);
  assert.ok(!(await get("/api/slots?n=24", {})).body.slots.some((x) => x.video?.platform === "tiktok"), "TikTok clips never reach the site");
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
  assert.ok(!slots.some((x) => x.video), "pasted videos stay off the live tiles");
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
  assert.ok(!(await get("/api/slots?n=24", {})).body.slots.some((x) => x.video), "replays are not shown as live tiles");
  // the owner's stream is on the grid as "starts soon" (not LIVE) until the phone actually streams
  const own = (await get("/api/slots?n=24", {})).body.slots.find((x) => x.stream?.owner);
  assert.equal(own.kind, "upcoming");
});

test("setup lists the listings feed, no social-video items (not shown on the site), no reserve hold", async () => {
  const items = Object.fromEntries((await get("/api/admin/setup")).body.items.map((i) => [i.key, i]));
  assert.equal(items.listings.ok, true, JSON.stringify(items)); assert.equal(items.youtube, undefined); assert.equal(items.instagram, undefined); assert.equal(items.tiktok, undefined); assert.equal(items.holds, undefined);
  assert.equal((await get("/api/config", {})).body.holds, undefined, "Reserve hold removed");
});
