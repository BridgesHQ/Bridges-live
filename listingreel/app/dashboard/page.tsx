import Link from 'next/link';
import {requireUser} from '@/lib/supabase/server';
import {configured} from '@/lib/env';
import {Notice} from '@/components/Notice';

export const dynamic = 'force-dynamic';

export default async function Dashboard({searchParams}: {searchParams: {error?: string; notice?: string}}) {
  const {sb, user} = await requireUser();
  const {data: listings} = user ? await sb.from('lr_listings').select('*').order('created_at', {ascending: false}) : {data: [] as any[]};
  const {data: sub} = user ? await sb.from('lr_subscriptions').select('status,trial_end').maybeSingle() : {data: null};
  const billing = configured('stripe');
  const active = sub?.status === 'active' || sub?.status === 'trialing';
  return (
    <main className="max-w-6xl mx-auto p-8">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div><h1 className="text-3xl font-bold">ListingReel</h1><p className="text-slate-500">Your listing video pipeline · {user?.email}</p></div>
        <div className="flex gap-2">
          {billing && !active && <form action="/api/stripe/checkout" method="post"><button className="btn btn-secondary">Start 7-day free trial · $149/mo</button></form>}
          {billing && active && <span className="btn btn-secondary">Pro · {sub!.status}</span>}
          <Link href="/dashboard/listings/new" className="btn btn-primary">+ New Listing</Link>
          <form action="/auth/signout" method="post"><button className="btn btn-secondary">Sign out</button></form>
        </div>
      </div>
      <Notice searchParams={searchParams} />
      <div className="grid gap-4 mt-8">
        {listings?.map((l: any) => (
          <Link key={l.id} href={`/dashboard/listings/${l.id}`} className="card p-5">
            <div className="font-semibold">{l.address}</div>
            <div className="text-slate-500">${Number(l.price).toLocaleString()} · {l.beds} bd · {l.baths} ba · {Number(l.sqft).toLocaleString()} sqft</div>
            <div className="mt-2 text-sm">Status: {l.status}</div>
          </Link>
        ))}
        {!listings?.length && <div className="card p-10 text-center text-slate-500">No listings yet. Create your first one.</div>}
      </div>
    </main>
  );
}
