// Bridges Live — Stripe Connect: SaaS subscriptions + Matcha/e-commerce orders
import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const router = express.Router();

// SaaS subscription checkout (agent/brokerage/merchant plans)
router.post("/billing/subscribe", async (req,res)=>{
  const { orgId, priceId, email } = req.body;
  const session = await stripe.checkout.sessions.create({
    mode:"subscription", customer_email:email,
    line_items:[{ price:priceId, quantity:1 }],
    success_url:`${process.env.APP_URL}/admin?sub=ok`,
    cancel_url:`${process.env.APP_URL}/list-with-us`,
    metadata:{ orgId }
  });
  res.json({ url: session.url });
});

// Matcha / e-commerce order (multi-currency; intl methods enabled in Stripe dashboard)
router.post("/orders/checkout", async (req,res)=>{
  const { orgId, email, currency="usd", items } = req.body;
  const line_items = items.map(i=>({ price_data:{ currency, product_data:{name:i.name}, unit_amount:Math.round(i.price*100)}, quantity:i.qty }));
  const session = await stripe.checkout.sessions.create({
    mode:"payment", customer_email:email, line_items,
    payment_method_types:["card","alipay","wechat_pay","sepa_debit","ideal"],
    success_url:`${process.env.APP_URL}/matcha?order=ok`, cancel_url:`${process.env.APP_URL}/matcha`,
    metadata:{ orgId }
  });
  await supa.from("orders").insert({ org_id:orgId, buyer_email:email, currency, items, stripe_payment_intent:session.id, status:"pending" });
  res.json({ url: session.url });
});

// Stripe webhook — mark orders paid / subs active
router.post("/webhooks/stripe", express.raw({type:"application/json"}), async (req,res)=>{
  let evt;
  try { evt = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET); }
  catch(e){ return res.status(400).send(`bad sig: ${e.message}`); }
  if (evt.type==="checkout.session.completed"){
    const s=evt.data.object;
    if (s.mode==="payment") await supa.from("orders").update({status:"paid"}).eq("stripe_payment_intent",s.id);
    if (s.mode==="subscription") await supa.from("subscriptions").insert({ org_id:s.metadata.orgId, stripe_subscription_id:s.subscription, status:"active" });
  }
  res.json({ received:true });
});
export default router;
