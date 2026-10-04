import {requireUser} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {pollRenders} from '@/lib/render/poll';
import {readBody, reply} from '@/lib/http';
import {UUID_RE} from '@/lib/security/safe-url';

export const maxDuration = 60;

export async function POST(req: Request) {
  const {data, isForm} = await readBody(req);
  const id = String(data.listingId ?? '');
  const {user} = await requireUser();
  if (!user) return reply(req, isForm, '/login', {error: 'Please sign in'}, 401);
  if (!UUID_RE.test(id)) return reply(req, isForm, '/dashboard', {error: 'Invalid listing'}, 400);
  const {data: l} = await supabaseAdmin.from('lr_listings').select('id').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!l) return reply(req, isForm, '/dashboard', {error: 'Listing not found'}, 404);
  const r = await pollRenders(id);
  return reply(req, isForm, `/dashboard/listings/${id}`, {...r, message: r.completed ? `${r.completed} video(s) ready` : r.checked ? 'Still rendering — check again in a minute' : 'Nothing rendering'});
}
