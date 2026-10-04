import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/supabase/server';
import {ScriptCard} from '@/components/ScriptCard';
import {Notice} from '@/components/Notice';
import {UUID_RE} from '@/lib/security/safe-url';

export const dynamic = 'force-dynamic';

export default async function Listing({params, searchParams}: {params: {id: string}; searchParams: {error?: string; notice?: string}}) {
  if (!UUID_RE.test(params.id)) notFound();
  const {sb} = await requireUser();
  const {data: l} = await sb.from('lr_listings').select('*').eq('id', params.id).maybeSingle();
  if (!l) notFound();
  const {data: scripts} = await sb.from('lr_scripts').select('*').eq('listing_id', l.id).order('idx');
  const {data: videos} = await sb.from('lr_videos').select('*').eq('listing_id', l.id).order('scheduled_for');
  const approved = scripts?.filter((s: any) => s.approved).length || 0;
  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/dashboard">← Dashboard</Link>
      <h1 className="text-3xl font-bold mt-4">{l.address}</h1>
      <p className="text-slate-500">${Number(l.price).toLocaleString()} · {l.beds} bd · {l.baths} ba · {Number(l.sqft).toLocaleString()} sqft · status: {l.status}</p>
      <Notice searchParams={searchParams} />
      <div className="mt-6 flex gap-3 flex-wrap">
        <form action="/api/generate-scripts" method="post"><input type="hidden" name="listingId" value={l.id} /><button className="btn btn-primary" disabled={l.status === 'generating'}>{scripts?.length ? 'Regenerate 10 Scripts' : 'Generate 10 Scripts'}</button></form>
        <form action="/api/render" method="post"><input type="hidden" name="listingId" value={l.id} /><button className="btn btn-secondary" disabled={!approved}>Render {approved || ''} Approved</button></form>
        {videos?.some((v: any) => v.render_status === 'rendering') && <form action="/api/render/refresh" method="post"><input type="hidden" name="listingId" value={l.id} /><button className="btn btn-secondary">Check video progress</button></form>}
      </div>
      <p className="text-sm text-slate-500 mt-2">Generating takes up to a minute. Approve the scripts you like, then render.</p>
      <section className="mt-8">
        <h2 className="text-xl font-bold">Scripts</h2>
        <div className="grid md:grid-cols-2 gap-4 mt-3">{scripts?.map((s: any) => <ScriptCard key={s.id} s={s} />)}</div>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-bold">Videos</h2>
        <div className="grid gap-3 mt-3">
          {videos?.map((v: any) => (
            <div className="card p-4" key={v.id}>
              {v.scheduled_for}: {v.render_status}
              {v.mp4_url && <a className="underline ml-2" href={v.mp4_url} target="_blank" rel="noopener">Download MP4</a>}
              {v.mp4_url && <span className="ml-3 text-sm text-slate-500">Tracking link: /api/tracking/{v.id}</span>}
            </div>
          ))}
          {!videos?.length && <div className="text-slate-500">No videos yet.</div>}
        </div>
      </section>
    </main>
  );
}
