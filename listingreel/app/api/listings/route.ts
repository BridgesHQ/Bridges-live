import {z} from 'zod';
import {requireUser} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
import {json} from '@/lib/http';
import {safeHttpUrl} from '@/lib/security/safe-url';

const Form = z.object({
  address: z.string().trim().min(5).max(200),
  price: z.coerce.number().positive().max(1e9),
  beds: z.coerce.number().int().min(0).max(50),
  baths: z.coerce.number().min(0).max(50),
  sqft: z.coerce.number().int().positive().max(1e6),
  h1: z.string().trim().min(2).max(300), h2: z.string().trim().min(2).max(300), h3: z.string().trim().min(2).max(300),
  agentName: z.string().trim().min(2).max(120),
  brokerageName: z.string().trim().min(2).max(160),
  ctaLink: z.string().trim(),
  ack: z.literal(true),
});
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

export async function POST(req: Request) {
  const {user} = await requireUser();
  if (!user) return json({error: 'Unauthorized'}, 401);
  const fd = await req.formData();
  let parsed;
  try { parsed = Form.safeParse(JSON.parse(String(fd.get('form') ?? '{}'))); } catch { return json({error: 'Invalid form'}, 400); }
  if (!parsed.success) return json({error: parsed.error.issues[0]?.path.join('.') === 'ack' ? 'Photo rights acknowledgement required' : `Check the field: ${parsed.error.issues[0]?.path.join('.')}`}, 400);
  const form = parsed.data;
  const ctaLink = safeHttpUrl(form.ctaLink);
  if (!ctaLink) return json({error: 'CTA link must be a full https:// URL'}, 400);

  const files = fd.getAll('photos').filter((x): x is File => x instanceof File);
  if (files.length < 10 || files.length > 20) return json({error: '10–20 photos required'}, 400);
  for (const f of files) if (f.size > MAX_BYTES || !TYPES[f.type]) return json({error: 'JPEG/PNG only, max 10 MB each'}, 400);

  const listingId = crypto.randomUUID();
  const paths: string[] = [];
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const path = `${user.id}/${listingId}/${String(i).padStart(2, '0')}.${TYPES[f.type]}`; // server-chosen name
    const up = await supabaseAdmin.storage.from('listing-photos').upload(path, await f.arrayBuffer(), {contentType: f.type, upsert: false});
    if (up.error) {
      if (paths.length) await supabaseAdmin.storage.from('listing-photos').remove(paths);
      return json({error: `Upload failed: ${up.error.message}`}, 500);
    }
    paths.push(path);
    const {data: signed} = await supabaseAdmin.storage.from('listing-photos').createSignedUrl(path, 60 * 60 * 24 * 30);
    if (!signed) return json({error: 'Could not sign photo URL'}, 500);
    urls.push(signed.signedUrl);
  }
  const {error} = await supabaseAdmin.from('lr_listings').insert({
    id: listingId, user_id: user.id, address: form.address, price: form.price, beds: form.beds, baths: form.baths, sqft: form.sqft,
    highlights: [form.h1, form.h2, form.h3], agent_name: form.agentName, brokerage_name: form.brokerageName,
    cta_link: ctaLink, photos: urls, photo_paths: paths, license_ack: true,
  });
  if (error) { await supabaseAdmin.storage.from('listing-photos').remove(paths); return json({error: error.message}, 500); }
  return json({id: listingId});
}
