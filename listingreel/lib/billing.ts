import {configured} from '@/lib/env';
import {supabaseAdmin} from '@/lib/supabase/admin';

/** Paid features (AI scripts, video renders) need an active or trialing subscription.
 *  When Stripe isn't configured yet (local testing), everything is allowed. */
export async function hasPaidAccess(userId: string) {
  if (!configured('stripe')) return true;
  const {data} = await supabaseAdmin.from('lr_subscriptions').select('status').eq('user_id', userId).maybeSingle();
  return data?.status === 'active' || data?.status === 'trialing';
}
