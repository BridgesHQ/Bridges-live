// Watches every Cloudflare-backed stream and tells the grid who is on air right now.
import { config } from "../config.js";
import { db, invalidateStreams } from "../db.js";
import { cloudflareEnabled, isLive } from "./cloudflare.js";
import { broadcastAll } from "../realtime.js";

const state = new Map(); // streamId -> boolean (live now)

/** Live-now flag for a stream. Non-Cloudflare streams (YouTube links, demo seeds) count as live. */
export function liveNow(stream) {
  if (stream.provider !== "cloudflare") return true;
  return state.get(stream.id) === true;
}

export async function pollOnce() {
  if (!cloudflareEnabled()) return 0;
  const rows = (await db.select("streams", { provider: "cloudflare", status: "live" }).catch(() => [])).filter((s) => s.meta?.cf_input_uid);
  let changes = 0;
  await Promise.all(rows.map(async (s) => {
    let live = false;
    try { live = await isLive(s.meta.cf_input_uid); } catch {}
    if (state.get(s.id) !== live) {
      state.set(s.id, live);
      changes++;
      broadcastAll({ type: "stream_status", streamId: s.id, live });
    }
  }));
  if (changes) invalidateStreams();
  return changes;
}

export function startStreamMonitor() {
  if (!cloudflareEnabled()) return;
  pollOnce().catch(() => {});
  setInterval(() => pollOnce().catch((e) => console.warn("[stream monitor]", e.message)), config.cloudflare.pollMs).unref();
}
