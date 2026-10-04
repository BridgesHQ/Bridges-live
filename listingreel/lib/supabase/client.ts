'use client';
import {createBrowserClient} from '@supabase/ssr';

// Cookie-based browser client so the server (middleware, route handlers) sees the session.
// The previous version used plain supabase-js, which stores the session in localStorage —
// the server never saw the login and /dashboard redirected back to /login forever.
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
