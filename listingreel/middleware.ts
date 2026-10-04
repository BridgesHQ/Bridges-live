import {NextResponse, type NextRequest} from 'next/server';
import {createServerClient} from '@supabase/ssr';

// Refreshes the Supabase session cookie and protects /dashboard.
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse('ListingReel is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.', {status: 503});
  let res = NextResponse.next({request: req});
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cs) => {
        cs.forEach(({name, value}) => req.cookies.set(name, value));
        res = NextResponse.next({request: req});
        cs.forEach(({name, value, options}) => res.cookies.set(name, value, options));
      },
    },
  });
  const {data: {user}} = await sb.auth.getUser();
  if (!user) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return res;
}
export const config = {matcher: ['/dashboard/:path*']};
