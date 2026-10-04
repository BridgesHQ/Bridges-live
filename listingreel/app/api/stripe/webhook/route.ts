import type Stripe from 'stripe';
import {stripe} from '@/lib/stripe';
import {env} from '@/lib/env';
import {supabaseAdmin} from '@/lib/supabase/admin';

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', {status: 400});
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(raw, sig, env('stripe').STRIPE_WEBHOOK_SECRET); }
  catch { return new Response('Invalid signature', {status: 400}); }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.client_reference_id && s.customer) {
      await supabaseAdmin.from('lr_subscriptions').upsert(
        {user_id: s.client_reference_id, stripe_customer_id: String(s.customer), stripe_subscription_id: s.subscription ? String(s.subscription) : null},
        {onConflict: 'user_id'},
      );
    }
  }
  if (event.type.startsWith('customer.subscription.')) {
    const o = event.data.object as Stripe.Subscription;
    const customer = String(o.customer);
    // The old handler upserted without user_id (a NOT NULL column) — every event failed.
    let userId = o.metadata?.user_id || null;
    if (!userId) {
      const {data} = await supabaseAdmin.from('lr_subscriptions').select('user_id').eq('stripe_customer_id', customer).maybeSingle();
      userId = data?.user_id ?? null;
    }
    if (!userId) return Response.json({received: true, skipped: 'unknown customer'});
    const periodEnd = (o as any).current_period_end ?? o.items?.data?.[0]?.current_period_end;
    const {error} = await supabaseAdmin.from('lr_subscriptions').upsert(
      {user_id: userId, stripe_customer_id: customer, stripe_subscription_id: o.id, status: event.type === 'customer.subscription.deleted' ? 'canceled' : o.status, trial_end: iso(o.trial_end), current_period_end: iso(periodEnd)},
      {onConflict: 'user_id'},
    );
    if (error) return new Response(`DB error: ${error.message}`, {status: 500}); // Stripe retries
  }
  return Response.json({received: true});
}
