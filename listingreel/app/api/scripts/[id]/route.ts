import {z} from 'zod';
import {requireUser} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {complianceFlags} from '@/lib/ai/compliance';
import {json} from '@/lib/http';
import {UUID_RE} from '@/lib/security/safe-url';

const Patch = z.object({
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().min(1).max(500),
  scenes: z.array(z.object({photoIndex: z.number().int().min(0).max(19), caption: z.string().max(300), durationSec: z.number().min(1).max(15)})).min(1).max(10),
  cta: z.string().trim().min(1).max(300),
  caption: z.string().trim().min(1).max(2200),
  approved: z.boolean(),
}).partial();

export async function PATCH(req: Request, {params}: {params: {id: string}}) {
  const {user} = await requireUser();
  if (!user) return json({error: 'Unauthorized'}, 401);
  if (!UUID_RE.test(params.id)) return json({error: 'Not found'}, 404);
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({error: 'Invalid script update'}, 400);
  const {data: s} = await supabaseAdmin.from('lr_scripts').select('*, lr_listings!inner(user_id)').eq('id', params.id).single();
  if (!s || (s as any).lr_listings.user_id !== user.id) return json({error: 'Not found'}, 404);
  const next = {...s, ...parsed.data};
  // edited text must pass the same Fair Housing check as generated text
  const flags = complianceFlags(JSON.stringify({title: next.title, hook: next.hook, scenes: next.scenes, cta: next.cta, caption: next.caption}));
  if (flags.length) return json({error: `Fair Housing compliance flag: ${flags.join(', ')}`}, 422);
  const {error} = await supabaseAdmin.from('lr_scripts').update(parsed.data).eq('id', params.id);
  if (error) return json({error: error.message}, 500);
  return json({ok: true});
}
