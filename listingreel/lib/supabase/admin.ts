import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {env} from '@/lib/env';

// Service-role client: server-only, bypasses RLS. Created lazily so builds don't need the key.
let client: SupabaseClient | null = null;
function get() {
  if (!client) client = createClient(env('public').NEXT_PUBLIC_SUPABASE_URL, env('supabaseAdmin').SUPABASE_SERVICE_ROLE_KEY, {auth: {autoRefreshToken: false, persistSession: false}});
  return client;
}
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = get();
    const v = (c as any)[prop];
    return typeof v === 'function' ? v.bind(c) : v;
  },
});
