// WebSocket hub: per-stream rooms (chat, viewer counts, purchase/hold/showing events)
// plus a lobby channel that receives live viewer counts for the multi-stream grid.
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { db, getStream, listStreams } from "./db.js";

const rooms = new Map();      // streamId -> Set<ws>
const history = new Map();    // streamId -> last N events (chat + commerce) for late joiners
const lobby = new Set();
const HISTORY = 40;

const INTENT = [
  ["buy", /\b(buy|order|purchase|checkout|add to cart|i'?ll take)\b/i],
  ["reserve", /\b(reserve|hold|deposit|claim(ing)?)\b/i],
  ["showing", /\b(tour|showing|visit|see it|walk ?through|appointment)\b/i],
  ["price", /(\$|\bprice\b|\bcost\b|\bhow much\b|\bhoa\b|\brent\b)/i],
  ["question", /\?\s*$/],
];
const SPAM = /(https?:\/\/|www\.|\.com\b|t\.me\/|whatsapp\.com|\bcrypto\b|\bforex\b|\bviagra\b)/i;
const ABUSE = /\b(fuck|shit|bitch|cunt|nigg|fag)\w*/i;

export function classify(body) {
  const moderation = SPAM.test(body) || ABUSE.test(body) ? "hidden" : "visible";
  const intent = (INTENT.find(([, re]) => re.test(body)) || ["none"])[0];
  return { intent, moderation };
}

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

function send(ws, payload) { if (ws.readyState === 1) ws.send(JSON.stringify(payload)); }

function remember(streamId, evt) {
  const h = history.get(streamId) || [];
  h.push(evt);
  while (h.length > HISTORY) h.shift();
  history.set(streamId, h);
}

export function broadcast(streamId, payload, { remember: keep = true } = {}) {
  if (keep) remember(streamId, payload);
  for (const ws of rooms.get(streamId) || []) send(ws, payload);
}

/** Commerce events also go to the lobby so the grid can show a "just bought" ticker. */
export function broadcastCommerce(streamId, payload) {
  remember(streamId, payload);
  const targets = new Set([...(rooms.get(streamId) || []), ...lobby]); // a viewer may be in both
  for (const ws of targets) send(ws, payload);
}

function viewerCount(stream, id) {
  const real = rooms.get(id)?.size || 0;
  return real + (config.demoMode ? stream?.baselineViewers || 0 : 0);
}

let countsTimer = null;
function scheduleCounts() {
  if (countsTimer) return;
  countsTimer = setTimeout(async () => {
    countsTimer = null;
    const streams = await listStreams().catch(() => []);
    const counts = Object.fromEntries(streams.map((s) => [s.id, viewerCount(s, s.id)]));
    for (const ws of lobby) send(ws, { type: "counts", counts });
  }, 500);
}

async function pushRoomCount(id) {
  const stream = await getStream(id).catch(() => null);
  broadcast(id, { type: "viewer_count", streamId: id, count: viewerCount(stream, id) }, { remember: false });
  scheduleCounts();
}

function leave(ws) {
  if (ws.room && rooms.has(ws.room)) {
    rooms.get(ws.room).delete(ws);
    pushRoomCount(ws.room);
  }
  ws.room = null;
}

async function onChat(ws, msg) {
  if (!ws.room) return;
  const nowMs = Date.now();
  if (nowMs - (ws.lastChat || 0) < 700) return send(ws, { type: "error", error: "Slow down a little 🙂" });
  ws.lastChat = nowMs;
  const body = clean(msg.body, 280);
  if (!body) return;
  const { intent, moderation } = classify(body);
  const evt = { type: "chat_message", streamId: ws.room, name: ws.name, body, intent, ts: new Date().toISOString() };
  if (moderation === "hidden") {
    send(ws, { ...evt, held: true }); // only the sender sees it; moderators review in Command Center
  } else {
    broadcast(ws.room, evt);
  }
  const stream = await getStream(ws.room).catch(() => null);
  try {
    await db.insert("chat_messages", { stream_id: ws.room, display_name: ws.name, body, intent, moderation });
    await db.insert("comment_events", {
      show_id: stream?.showId || null, stream_id: ws.room, host_id: stream?.hostId || null, org_id: stream?.orgId || null,
      item_id: stream?.listingId || null, platform: "onsite", author: ws.name, body, intent, moderation,
    });
  } catch (e) { console.warn("[chat persist]", e.message); }
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4 * 1024 });

  wss.on("connection", (ws) => {
    ws.name = "Guest";
    ws.alive = true;
    ws.on("pong", () => { ws.alive = true; });
    ws.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.name) ws.name = clean(msg.name, 40) || "Guest";
      switch (msg.type) {
        case "lobby":
          lobby.add(ws); scheduleCounts(); break;
        case "join": {
          const id = clean(msg.streamId, 64);
          const stream = await getStream(id).catch(() => null);
          if (!stream) return send(ws, { type: "error", error: "Stream not found" });
          leave(ws);
          ws.room = stream.id;
          if (!rooms.has(stream.id)) rooms.set(stream.id, new Set());
          rooms.get(stream.id).add(ws);
          send(ws, { type: "history", streamId: stream.id, events: history.get(stream.id) || [] });
          pushRoomCount(stream.id);
          break;
        }
        case "leave": leave(ws); break;
        case "chat": await onChat(ws, msg); break;
        case "like":
          if (ws.room && Date.now() - (ws.lastLike || 0) > 300) {
            ws.lastLike = Date.now();
            broadcast(ws.room, { type: "like", streamId: ws.room }, { remember: false });
          }
          break;
      }
    });
    ws.on("close", () => { leave(ws); lobby.delete(ws); });
  });

  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(beat));
  return wss;
}

export function roomSize(id) { return rooms.get(id)?.size || 0; }
