import {NextResponse} from 'next/server';
import {supabaseServer} from '@/lib/supabase/server';
import {safeNextPath} from '@/lib/security/safe-url';

// Magic-link and Google sign-in land here with ?code=… ; exchange it for a session cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next')); // relative paths only — no open redirect
  if (code) {
    const {error} = await supabaseServer().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('Sign-in link expired or invalid — try again'), url.origin));
}
