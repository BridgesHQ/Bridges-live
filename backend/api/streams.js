// Bridges Live — Stream room creation + WebSocket events
// Node/TS-style (Express + ws). Provider abstraction: Cloudflare Stream / IVS / LiveKit.
import express from "express";
import { WebSocketServer } from "ws";
import { createClient } from "@supabase/supabase-js";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const router = express.Router();

// POST /api/streams/init  — create a stream room for a show
router.post("/streams/init", async (req, res) => {
  const { showId, provider = "cloudflare" } = req.body;
  // 1) create live input at provider (Cloudflare Stream example)
  let ingest, playback, roomId;
  if (provider === "cloudflare") {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT}/stream/live_inputs`,
      { method:"POST", headers:{ Authorization:`Bearer ${process.env.CF_STREAM_TOKEN}`,"Content-Type":"application/json"},
        body: JSON.stringify({ meta:{ showId }, recording:{ mode:"automatic" } }) });
    const j = await r.json();
    ingest = j.result?.rtmps?.url + j.result?.rtmps?.streamKey; // keep streamKey server-side only
    playback = `https://customer-${process.env.CF_SUBDOMAIN}.cloudflarestream.com/${j.result?.uid}/manifest/video.m3u8`;
    roomId = j.result?.uid;
  }
  // 2) persist stream (never return the raw streamKey to the browser)
  const { data } = await supa.from("streams").insert({
    show_id: showId, provider, playback_url: playback, room_id: roomId, status: "idle"
  }).select().single();
  await supa.from("shows").update({ status:"live" }).eq("id", showId);
  res.json({ streamId: data.id, playbackUrl: playback, roomId }); // ingest/streamKey stays server-side
});

// POST /api/streams/:id/stop
router.post("/streams/:id/stop", async (req,res)=>{
  await supa.from("streams").update({ status:"ended" }).eq("id", req.params.id);
  res.json({ ok:true });
});

// ---- WebSocket server: rooms, viewer count, live chat, showing requests ----
export function attachWs(server){
  const wss = new WebSocketServer({ server, path:"/ws" });
  const rooms = new Map(); // roomId -> Set(sockets)
  wss.on("connection",(ws)=>{
    let room=null, name="Guest";
    ws.on("message", async (raw)=>{
      const msg = JSON.parse(raw.toString());
      if (msg.type==="join"){
        room=msg.roomId; name=msg.name||"Guest";
        if(!rooms.has(room)) rooms.set(room,new Set());
        rooms.get(room).add(ws);
        broadcast(room,{type:"viewer_count",count:rooms.get(room).size});
        await supa.from("streams").update({viewer_count:rooms.get(room).size}).eq("room_id",room);
      }
      if (msg.type==="chat"){
        broadcast(room,{type:"chat_message",name,body:msg.body});
        await supa.from("chat_messages").insert({ stream_id:msg.streamId, display_name:name, body:msg.body });
      }
      if (msg.type==="showing_request"){ // viewer raises hand -> lead + engagement
        const { data:eng } = await supa.from("engagements").insert({ show_id:msg.showId, type:"showing_request" }).select().single();
        await supa.from("leads").insert({ engagement_id:eng.id, listing_id:msg.listingId, host_id:msg.hostId, org_id:msg.orgId, first_name:msg.name, email:msg.email, phone:msg.phone, source:"live-show" });
        broadcast(room,{type:"showing_requested",name});
      }
    });
    ws.on("close",()=>{ if(room&&rooms.has(room)){ rooms.get(room).delete(ws); broadcast(room,{type:"viewer_count",count:rooms.get(room).size}); }});
  });
  function broadcast(room,payload){ (rooms.get(room)||[]).forEach(s=>{ try{s.send(JSON.stringify(payload));}catch{} }); }
}
export default router;
