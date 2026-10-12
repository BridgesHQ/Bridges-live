// Recent videos from Dorota's social accounts fill the Bridges Live grid between live streams.
//   YouTube   — YouTube Data API v3 (API key + channel id/handle). Videos embed and play on the site.
//               A video that is live right now on YouTube counts as a real live stream (real viewer count).
//   Instagram — Instagram API with Instagram Login (long-lived token, auto-refreshed). Reels play on the site.
//   TikTok    — Display API (OAuth "Connect TikTok" in /admin). TikTok can't be embedded as a player,
//               so tiles show the cover with a "Watch on TikTok" button.
// Any public YouTube / TikTok / Instagram link can also be added by hand from /admin.
// Rows live in `social_videos`; /admin can hide any video from the site.
import crypto from "node:crypto";
import { config } from "../config.js";
import { db, getSetting, setSetting } from "../db.js";

const S = () => config.social;
const now = () => new Date().toISOString();
const clip = (v, n = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function getJSON(url, opts = {}) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}: ${j.error?.message || j.error_description || j.error?.code || j.message || r.statusText}`);
  return j;
}

// ---------------------------------------------------------------- YouTube
export async function youtubeVideos() {
  const s = S(), key = encodeURIComponent(s.youtubeKey);
  const ch = await getJSON(`${s.youtubeBase}/channels?part=contentDetails,snippet&${s.youtubeChannel ? `id=${encodeURIComponent(s.youtubeChannel)}` : `forHandle=${encodeURIComponent(s.youtubeHandle)}`}&key=${key}`);
  const channel = ch.items?.[0];
  if (!channel) throw new Error("YouTube channel not found — check YOUTUBE_CHANNEL_ID / YOUTUBE_HANDLE");
  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  const pl = await getJSON(`${s.youtubeBase}/playlistItems?part=contentDetails&maxResults=${s.max}&playlistId=${encodeURIComponent(uploads)}&key=${key}`);
  const ids = (pl.items || []).map((i) => i.contentDetails.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await getJSON(`${s.youtubeBase}/videos?part=snippet,liveStreamingDetails,status&id=${ids.join(",")}&key=${key}`);
  return (v.items || []).filter((x) => x.status?.embeddable !== false && x.status?.privacyStatus !== "private").map((x) => {
    const sn = x.snippet || {}, live = sn.liveBroadcastContent === "live";
    return {
      id: `youtube:${x.id}`, platform: "youtube", external_id: x.id, title: clip(sn.title, 160),
      thumbnail: sn.thumbnails?.maxres?.url || sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`,
      media_url: null, embed_url: `https://www.youtube.com/embed/${x.id}`, permalink: `https://www.youtube.com/watch?v=${x.id}`,
      published_at: x.liveStreamingDetails?.actualStartTime || sn.publishedAt || null,
      is_live: live, viewers: live ? Number(x.liveStreamingDetails?.concurrentViewers || 0) : null,
      upcoming: sn.liveBroadcastContent === "upcoming", scheduled_at: x.liveStreamingDetails?.scheduledStartTime || null,
    };
  });
}

// ---------------------------------------------------------------- Instagram
async function instagramToken() {
  const stored = await getSetting("instagram_token");
  let token = stored?.token || S().instagramToken;
  if (!token) return null;
  // long-lived tokens last 60 days; refresh every ~20 days so it never lapses
  if (!stored?.refreshed_at || Date.now() - new Date(stored.refreshed_at) > 20 * 864e5) {
    try {
      const r = await getJSON(`${S().instagramBase}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
      if (r.access_token) { token = r.access_token; await setSetting("instagram_token", { token, refreshed_at: now() }); }
    } catch (e) { console.warn("[instagram refresh]", e.message); }
  }
  return token;
}
export async function instagramVideos() {
  const token = await instagramToken();
  if (!token) return [];
  const j = await getJSON(`${S().instagramBase}/me/media?fields=id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp&limit=${S().max * 2}&access_token=${encodeURIComponent(token)}`);
  return (j.data || []).filter((m) => m.media_type === "VIDEO").slice(0, S().max).map((m) => ({
    id: `instagram:${m.id}`, platform: "instagram", external_id: m.id, title: clip(m.caption, 160) || "Instagram Reel",
    thumbnail: m.thumbnail_url || null, media_url: m.media_url || null, embed_url: null, permalink: m.permalink,
    published_at: m.timestamp || null, is_live: false, viewers: null,
  }));
}

// ---------------------------------------------------------------- TikTok (OAuth + Display API)
export const tiktokConfigured = () => !!(S().tiktokClientKey && S().tiktokClientSecret);
export function tiktokAuthUrl(redirectUri) {
  const state = crypto.randomBytes(16).toString("hex");
  const sig = crypto.createHmac("sha256", config.adminToken || "bl").update(state).digest("hex").slice(0, 16);
  const q = new URLSearchParams({ client_key: S().tiktokClientKey, scope: "user.info.basic,video.list", response_type: "code", redirect_uri: redirectUri, state: `${state}.${sig}` });
  return `${S().tiktokAuthBase}/v2/auth/authorize/?${q}`;
}
export function tiktokStateOk(state) {
  const [s, sig] = String(state || "").split(".");
  return !!s && sig === crypto.createHmac("sha256", config.adminToken || "bl").update(s).digest("hex").slice(0, 16);
}
async function tiktokTokenCall(params) {
  const body = new URLSearchParams({ client_key: S().tiktokClientKey, client_secret: S().tiktokClientSecret, ...params });
  const j = await getJSON(`${S().tiktokBase}/v2/oauth/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!j.access_token) throw new Error(`TikTok: ${j.error_description || j.error || "no token"}`);
  const t = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 86400) * 1000, open_id: j.open_id, connected_at: now() };
  await setSetting("tiktok_token", t);
  return t;
}
export const tiktokExchangeCode = (code, redirectUri) => tiktokTokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
async function tiktokAccess() {
  const t = await getSetting("tiktok_token");
  if (!t?.refresh_token) return null;
  if (t.expires_at - Date.now() > 5 * 60_000) return t.access_token;
  return (await tiktokTokenCall({ grant_type: "refresh_token", refresh_token: t.refresh_token })).access_token;
}
export async function tiktokVideos() {
  if (!tiktokConfigured()) return [];
  const token = await tiktokAccess();
  if (!token) return [];
  const j = await getJSON(`${S().tiktokBase}/v2/video/list/?fields=id,title,video_description,cover_image_url,share_url,embed_link,create_time`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: Math.min(S().max, 20) }),
  });
  return (j.data?.videos || []).map((v) => ({
    id: `tiktok:${v.id}`, platform: "tiktok", external_id: v.id, title: clip(v.title || v.video_description, 160) || "TikTok video",
    thumbnail: v.cover_image_url || null, media_url: null, embed_url: null, permalink: v.share_url,
    published_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : null, is_live: false, viewers: null,
  }));
}

// ---------------------------------------------------------------- add one video by link
export async function videoFromUrl(url) {
  const u = String(url || "").trim();
  let m = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { id: `youtube:${m[1]}`, platform: "youtube", external_id: m[1], title: "YouTube video", thumbnail: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`, embed_url: `https://www.youtube.com/embed/${m[1]}`, permalink: `https://www.youtube.com/watch?v=${m[1]}`, media_url: null, published_at: now(), is_live: false, viewers: null };
  m = u.match(/^https:\/\/(?:www\.|vm\.|m\.)?tiktok\.com\/.+/);
  if (m) {
    let o = {};
    try { o = await getJSON(`${S().oembedTikTok}/oembed?url=${encodeURIComponent(u)}`); } catch (e) { console.warn("[tiktok oembed]", e.message); }
    const vid = (u.match(/video\/(\d+)/) || [])[1] || o.embed_product_id || crypto.createHash("sha1").update(u).digest("hex").slice(0, 16);
    return { id: `tiktok:${vid}`, platform: "tiktok", external_id: vid, title: clip(o.title, 160) || "TikTok video", thumbnail: o.thumbnail_url || null, permalink: u, embed_url: null, media_url: null, published_at: now(), is_live: false, viewers: null };
  }
  m = u.match(/^https:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/([\w-]+)/);
  if (m) return { id: `instagram:${m[1]}`, platform: "instagram", external_id: m[1], title: "Instagram Reel", thumbnail: null, permalink: `https://www.instagram.com/reel/${m[1]}/`, embed_url: `https://www.instagram.com/reel/${m[1]}/embed`, media_url: null, published_at: now(), is_live: false, viewers: null };
  throw Object.assign(new Error("Paste a public YouTube, TikTok or Instagram video link."), { status: 400 });
}

// ---------------------------------------------------------------- status + sync
export function socialStatus() {
  const s = S();
  return {
    youtube: { configured: !!(s.youtubeKey && (s.youtubeChannel || s.youtubeHandle)), need: "YOUTUBE_API_KEY + YOUTUBE_CHANNEL_ID (or YOUTUBE_HANDLE)" },
    instagram: { configured: !!s.instagramToken, need: "INSTAGRAM_ACCESS_TOKEN (Instagram API with Instagram Login)" },
    tiktok: { configured: tiktokConfigured(), need: "TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET, then Connect TikTok in admin" },
  };
}

export async function syncSocial() {
  const st = socialStatus(), results = {};
  const jobs = { youtube: st.youtube.configured && youtubeVideos, instagram: st.instagram.configured && instagramVideos, tiktok: st.tiktok.configured && tiktokVideos };
  for (const [p, fn] of Object.entries(jobs)) {
    if (!fn) { results[p] = { ok: false, skipped: true }; continue; }
    try {
      const vids = await fn();
      const t = now();
      for (const v of vids) {
        const prev = (await db.select("social_videos", { id: v.id }).catch(() => []))[0];
        await db.upsert("social_videos", { ...v, hidden: prev?.hidden ?? false, source: "api", synced_at: t });
      }
      // live flags only last while the platform says so
      const stale = (await db.select("social_videos", { platform: p, is_live: true }).catch(() => [])).filter((r) => !vids.some((v) => v.id === r.id && v.is_live));
      for (const r of stale) await db.update("social_videos", { id: r.id }, { is_live: false, viewers: null });
      results[p] = { ok: true, count: vids.length };
    } catch (e) { results[p] = { ok: false, error: e.message }; console.warn(`[social ${p}]`, e.message); }
  }
  await setSetting("social_last_sync", { at: now(), results });
  return results;
}

export async function syncSocialIfStale(maxAgeMs = 15 * 60_000) {
  const last = await getSetting("social_last_sync");
  if (last?.at && Date.now() - new Date(last.at) < maxAgeMs) return { skipped: true };
  return syncSocial();
}

export async function visibleVideos(limit = 24) {
  const rows = (await db.select("social_videos", {}).catch(() => [])).filter((r) => !r.hidden);
  return rows.sort((a, b) => (b.is_live === true) - (a.is_live === true) || String(b.published_at || "").localeCompare(String(a.published_at || ""))).slice(0, limit);
}
