import {NextResponse} from 'next/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {safeHttpUrl, UUID_RE} from '@/lib/security/safe-url';

export async function GET(req: Request, {params}: {params: {videoId: string}}) {
  if (!UUID_RE.test(params.videoId)) return NextResponse.json({error: 'Not found'}, {status: 404});
  const {data: v} = await supabaseAdmin.from('lr_videos').select('id, lr_listings(cta_link)').eq('id', params.videoId).maybeSingle();
  const url = safeHttpUrl((v as any)?.lr_listings?.cta_link);
  if (!v || !url) return NextResponse.json({error: 'Not found'}, {status: 404});
  await supabaseAdmin.from('lr_click_events').insert({
    video_id: v.id,
    referrer: (req.headers.get('referer') || '').slice(0, 500) || null,
    user_agent: (req.headers.get('user-agent') || '').slice(0, 500) || null,
  });
  return NextResponse.redirect(url, 302);
}
