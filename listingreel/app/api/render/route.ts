import {requireUser} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {createRender} from '@/lib/render/creatomate';
import {hasPaidAccess} from '@/lib/billing';
import {readBody, reply} from '@/lib/http';
import {UUID_RE} from '@/lib/security/safe-url';

export const maxDuration = 60;

export async function POST(req: Request) {
  const {data, isForm} = await readBody(req);
  const id = String(data.listingId ?? '');
  const back = UUID_RE.test(id) ? `/dashboard/listings/${id}` : '/dashboard';
  const {user} = await requireUser();
  if (!user) return reply(req, isForm, '/login', {error: 'Please sign in'}, 401);
  if (!UUID_RE.test(id)) return reply(req, isForm, back, {error: 'Invalid listing'}, 400);
  if (!(await hasPaidAccess(user.id))) return reply(req, isForm, back, {error: 'Start your free trial to render videos'}, 402);
  const {data: l} = await supabaseAdmin.from('lr_listings').select('*').eq('id', id).eq('user_id', user.id).single();
  if (!l) return reply(req, isForm, '/dashboard', {error: 'Listing not found'}, 404);
  const {data: scripts} = await supabaseAdmin.from('lr_scripts').select('*').eq('listing_id', id).eq('approved', true).order('idx');
  if (!scripts?.length) return reply(req, isForm, back, {error: 'Approve at least one script first'}, 400);
  // don't re-render scripts that already have a video in progress / done
  const {data: existing} = await supabaseAdmin.from('lr_videos').select('script_id').eq('listing_id', id).in('render_status', ['rendering', 'ready']);
  const done = new Set((existing || []).map((v) => v.script_id));
  const todo = scripts.filter((s) => !done.has(s.id));
  if (!todo.length) return reply(req, isForm, back, {message: 'All approved scripts are already rendering or done'});
  let queued = 0;
  try {
    for (let i = 0; i < todo.length; i++) {
      const render = await createRender({photos: l.photos, script: todo[i], listing: l});
      const job = Array.isArray(render) ? render[0] : render;
      await supabaseAdmin.from('lr_videos').insert({listing_id: id, script_id: todo[i].id, render_job_id: job.id, render_status: 'rendering', scheduled_for: new Date(Date.now() + i * 86400000).toISOString().slice(0, 10)});
      queued++;
    }
  } catch (e: any) {
    console.error('[render]', e);
    return reply(req, isForm, back, {error: `Queued ${queued}, then failed: ${e?.message}`}, 502);
  }
  await supabaseAdmin.from('lr_listings').update({status: 'rendering'}).eq('id', id);
  return reply(req, isForm, back, {queued, message: `${queued} video(s) rendering — they appear below when ready`});
}
