// Cloudflare Stream Live: one live input per agent. Agents broadcast to the input's RTMPS (or SRT)
// URL from a phone app (Larix Broadcaster) or OBS; viewers watch the HLS manifest.
// The stream key is never stored in our database — it's fetched from Cloudflare for the host page only.
import { config } from "../config.js";

const cf = () => config.cloudflare;
export const cloudflareEnabled = () => !!(cf().accountId && cf().token && cf().customerCode);

const deliveryBase = () => cf().deliveryBase || `https://customer-${cf().customerCode}.cloudflarestream.com`;
export const hlsUrl = (uid) => `${deliveryBase()}/${uid}/manifest/video.m3u8`;

async function api(method, path, body) {
  const r = await fetch(`${cf().apiBase}/accounts/${cf().accountId}/stream${path}`, {
    method,
    headers: { Authorization: `Bearer ${cf().token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const msg = j.errors?.map((e) => e.message).join("; ") || r.statusText;
    throw Object.assign(new Error(`Cloudflare Stream ${r.status}: ${msg}`), { status: r.status });
  }
  return j.result;
}

function shape(r) {
  return {
    uid: r.uid,
    rtmpsUrl: r.rtmps?.url || "rtmps://live.cloudflare.com:443/live/",
    streamKey: r.rtmps?.streamKey || "",
    srtUrl: r.srt?.url || null, srtStreamId: r.srt?.streamId || null, srtPassphrase: r.srt?.passphrase || null,
    hls: hlsUrl(r.uid),
    state: r.status?.current?.state || null,   // connected | disconnected | null
  };
}

/** Creates a live input for one agent's stream. Recordings are kept so the stream can be replayed. */
export async function createLiveInput({ name, streamId }) {
  const r = await api("POST", "/live_inputs", {
    meta: { name: String(name || "Bridges Live").slice(0, 100), bridges_stream_id: streamId },
    recording: { mode: "automatic", timeoutSeconds: 60, requireSignedURLs: false },
  });
  return shape(r);
}

export async function getLiveInput(uid) { return shape(await api("GET", `/live_inputs/${encodeURIComponent(uid)}`)); }

export async function deleteLiveInput(uid) {
  try { await api("DELETE", `/live_inputs/${encodeURIComponent(uid)}`); return true; }
  catch (e) { if (e.status === 404) return true; throw e; }
}

/** Public lifecycle endpoint — is this input broadcasting right now? (no auth, cheap) */
export async function isLive(uid) {
  const r = await fetch(`${deliveryBase()}/${encodeURIComponent(uid)}/lifecycle`, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) return false;
  const j = await r.json().catch(() => ({}));
  return j.live === true;
}

// ---------------------------------------------------------------- recordings
/** Recorded videos of a live input (Cloudflare records every broadcast automatically). */
export async function listRecordings(uid) {
  const rows = (await api("GET", `/live_inputs/${encodeURIComponent(uid)}/videos`)) || [];
  return rows.map((v) => ({
    uid: v.uid, created: v.created, duration: v.duration ?? null, ready: !!v.readyToStream,
    thumbnail: v.thumbnail || `${deliveryBase()}/${v.uid}/thumbnails/thumbnail.jpg`,
    watchUrl: `${deliveryBase()}/${v.uid}/watch`, iframe: `${deliveryBase()}/${v.uid}/iframe`, hls: hlsUrl(v.uid),
  }));
}

function shapeDownload(r) {
  const d = r?.default || {};
  return { status: d.status || "none", percent: d.percentComplete ?? null, url: d.status === "ready" ? d.url : null };
}
/** MP4 download for a recording: GET reports status; POST starts preparing it (takes a minute or two). */
export async function getDownload(videoUid) {
  try { return shapeDownload(await api("GET", `/${encodeURIComponent(videoUid)}/downloads`)); }
  catch (e) { if (e.status === 404) return { status: "none", percent: null, url: null }; throw e; }
}
export async function createDownload(videoUid) { return shapeDownload(await api("POST", `/${encodeURIComponent(videoUid)}/downloads`)); }
