import {NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {env, configured} from '@/lib/env';
import {pollRenders} from '@/lib/render/poll';

export const maxDuration = 60;

function authorized(req: Request) {
  const got = Buffer.from(req.headers.get('authorization') || '');
  const want = Buffer.from(`Bearer ${env('cron').CRON_SECRET}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// Daily safety net (Vercel Hobby allows daily crons). Users also refresh on demand from the listing page.
export async function GET(req: Request) {
  if (!configured('cron')) return NextResponse.json({error: 'CRON_SECRET is not configured'}, {status: 503});
  if (!authorized(req)) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  return NextResponse.json(await pollRenders());
}
