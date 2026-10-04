import {requireUser} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {stripe} from '@/lib/stripe';
import {env} from '@/lib/env';
import {readBody, reply} from '@/lib/http';

export async function POST(req: Request) {
  const {isForm} = await readBody(req);
  const {user} = await requireUser();
  if (!user) return reply(req, isForm, '/login', {error: 'Please sign in'}, 401);
  const {STRIPE_PRICE_ID, STRIPE_TRIAL_DAYS} = env('stripe');
  const app = env('public').NEXT_PUBLIC_APP_URL;
  const {data: sub} = await supabaseAdmin.from('lr_subscriptions').select('stripe_customer_id,status').eq('user_id', user.id).maybeSingle();
  if (sub?.status === 'active' || sub?.status === 'trialing') return reply(req, isForm, '/dashboard', {message: 'Your subscription is already active'});
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    ...(sub?.stripe_customer_id ? {customer: sub.stripe_customer_id} : {customer_email: user.email!}),
    client_reference_id: user.id, // links the Stripe customer back to this user in the webhook
    line_items: [{price: STRIPE_PRICE_ID, quantity: 1}],
    // one free trial per user
    subscription_data: {metadata: {user_id: user.id}, ...(sub ? {} : {trial_period_days: STRIPE_TRIAL_DAYS})},
    success_url: `${app}/dashboard?notice=${encodeURIComponent('Billing active — welcome to ListingReel Pro')}`,
    cancel_url: `${app}/dashboard`,
  });
  if (isForm) return Response.redirect(session.url!, 303);
  return Response.json({url: session.url});
}
