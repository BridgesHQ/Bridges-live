import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {env} from '@/lib/env';

export function supabaseServer() {
  const c = cookies();
  const {NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY} = env('public');
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => c.getAll(),
      // Writable in route handlers / server actions; read-only (and ignored) in server components.
      setAll: (cs) => { try { cs.forEach(({name, value, options}) => c.set(name, value, options)); } catch {} },
    },
  });
}

export async function requireUser() {
  const sb = supabaseServer();
  const {data: {user}} = await sb.auth.getUser();
  return {sb, user};
}
