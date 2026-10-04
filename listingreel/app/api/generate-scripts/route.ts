import {requireUser} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {generateScripts} from '@/lib/ai/claude';
import {hasPaidAccess} from '@/lib/billing';
import {readBody, reply} from '@/lib/http';
import {UUID_RE} from '@/lib/security/safe-url';

export const maxDuration = 60; // Vercel Hobby limit; generation takes ~20-50 s

export async function POST(req: Request) {
  const {data, isForm} = await readBody(req);
  const id = String(data.listingId ?? '');
  const back = UUID_RE.test(id) ? `/dashboard/listings/${id}` : '/dashboard';
  const {user} = await requireUser();
  if (!user) return reply(req, isForm, '/login', {error: 'Please sign in'}, 401);
  if (!UUID_RE.test(id)) return reply(req, isForm, back, {error: 'Invalid listing'}, 400);
  if (!(await hasPaidAccess(user.id))) return reply(req, isForm, back, {error: 'Start your free trial to generate scripts'}, 402);
  const {data: l} = await supabaseAdmin.from('lr_listings').select('*').eq('id', id).eq('user_id', user.id).single();
  if (!l) return reply(req, isForm, '/dashboard', {error: 'Listing not found'}, 404);
  if (l.status === 'generating') return reply(req, isForm, back, {error: 'Scripts are already being generated'}, 409);

  await supabaseAdmin.from('lr_listings').update({status: 'generating'}).eq('id', id);
  try {
    const scripts = await generateScripts({address: l.address, price: l.price, beds: l.beds, baths: l.baths, sqft: l.sqft, highlights: l.highlights, agentName: l.agent_name, brokerageName: l.brokerage_name, ctaLink: l.cta_link, photos: l.photos});
    await supabaseAdmin.from('lr_scripts').delete().eq('listing_id', id);
    const {error} = await supabaseAdmin.from('lr_scripts').insert(scripts.map((s, i) => ({listing_id: id, idx: i, title: s.title, hook: s.hook, scenes: s.scenes, cta: s.cta, caption: s.caption, approved: false})));
    if (error) throw new Error(error.message);
    await supabaseAdmin.from('lr_listings').update({status: 'scripts_ready'}).eq('id', id);
    return reply(req, isForm, back, {count: scripts.length, message: `${scripts.length} scripts ready — approve the ones you like`});
  } catch (e: any) {
    await supabaseAdmin.from('lr_listings').update({status: 'draft'}).eq('id', id);
    console.error('[generate-scripts]', e);
    return reply(req, isForm, back, {error: e?.message || 'Script generation failed'}, 500);
  }
}
