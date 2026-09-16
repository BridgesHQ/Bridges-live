// Bridges Live — Earnest money escrow webhooks (Earnnest / Payload)
// SOFTWARE NEVER HOLDS FUNDS. Processor routes buyer bank -> title/broker trust.
// This only RECORDS events + enforces FL 3-business-day deposit tracking.
import express from "express";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const router = express.Router();

// add N Florida BUSINESS days (skip Sat/Sun) — FREC 61J2-14
function addBusinessDays(date, n){
  const d=new Date(date); let added=0;
  while(added<n){ d.setDate(d.getDate()+1); const day=d.getDay(); if(day!==0&&day!==6) added++; }
  return d;
}
function verify(body, sig, secret){
  const h=crypto.createHmac("sha256",secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(h),Buffer.from(sig||""));
}

// POST /webhooks/earnnest  (and /webhooks/payload — same shape here)
["earnnest","payload"].forEach(proc=>{
  router.post(`/webhooks/${proc}`, express.raw({type:"application/json"}), async (req,res)=>{
    const secret = proc==="earnnest"?process.env.EARNNEST_SECRET:process.env.PAYLOAD_SECRET;
    if(!verify(req.body, req.headers["x-signature"], secret)) return res.status(400).send("bad signature");
    const e = JSON.parse(req.body.toString());
    // e: { transactionId, externalRef, amount, state, agreementAt, escrowAccount }
    const patch = {
      processor: proc, external_ref: e.externalRef, amount: e.amount, state: e.state,
      escrow_account: e.escrowAccount
    };
    if (e.state==="requested" && e.agreementAt){
      patch.agreement_at = e.agreementAt;
      patch.deposit_due_by = addBusinessDays(e.agreementAt, 3);   // FL 3 business days
    }
    if (e.state==="deposited"){
      patch.deposited_at = new Date().toISOString();
    }
    // upsert escrow event
    const { data } = await supa.from("escrow_events")
      .upsert({ transaction_id:e.transactionId, ...patch }, { onConflict:"external_ref" })
      .select().single();
    // breach check: past due & not deposited
    if (data?.deposit_due_by && !data.deposited_at && new Date() > new Date(data.deposit_due_by)){
      await supa.from("escrow_events").update({ breach_flag:true }).eq("id", data.id);
      // TODO: alert broker (email/SMS)
    }
    await supa.from("audit_logs").insert({ action:`escrow.${e.state}`, entity:"escrow_events", entity_id:data?.id, meta:e });
    res.json({ received:true });
  });
});

// GET /api/escrow/reconciliation?month=YYYY-MM  (Rule 61J2-14.012 export)
router.get("/escrow/reconciliation", async (req,res)=>{
  const { month } = req.query;
  const { data } = await supa.from("escrow_events").select("*").gte("created_at",`${month}-01`).lte("created_at",`${month}-31`);
  res.json({ month, count:data?.length||0, events:data }); // broker reviews + signs
});
export default router;
