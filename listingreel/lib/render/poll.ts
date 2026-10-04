import {supabaseAdmin} from '@/lib/supabase/admin';
import {getRender} from './creatomate';

/** Checks Creatomate for renders still in progress (optionally one listing) and records results. */
export async function pollRenders(listingId?: string) {
  let q = supabaseAdmin.from('lr_videos').select('*').eq('render_status', 'rendering').limit(50);
  if (listingId) q = q.eq('listing_id', listingId);
  const {data: videos} = await q;
  let completed = 0, failed = 0;
  const touched = new Set<string>();
  for (const v of videos || []) {
    try {
      const r = await getRender(v.render_job_id);
      if (r.status === 'succeeded' && r.url) { await supabaseAdmin.from('lr_videos').update({render_status: 'ready', mp4_url: r.url}).eq('id', v.id); completed++; touched.add(v.listing_id); }
      else if (r.status === 'failed') { await supabaseAdmin.from('lr_videos').update({render_status: 'failed'}).eq('id', v.id); failed++; touched.add(v.listing_id); }
    } catch (e) { console.error('[render poll]', v.id, e); }
  }
  for (const id of touched) {
    const {count} = await supabaseAdmin.from('lr_videos').select('id', {count: 'exact', head: true}).eq('listing_id', id).eq('render_status', 'rendering');
    if (!count) await supabaseAdmin.from('lr_listings').update({status: 'ready'}).eq('id', id);
  }
  return {checked: videos?.length || 0, completed, failed};
}
