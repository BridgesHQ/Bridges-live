// app/api/sync/stellar-mls/route.ts
// Syncs ACTIVE Stellar MLS listings (via Bridge Interactive RESO Web API) → Supabase `listings`.
// Aligned to Bridges schema: org_id + vertical_id + attributes JSONB.
// Run on a cron (Vercel Cron / Supabase scheduled function), e.g. every 15 min.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // service_role bypasses RLS for ingestion
);

const BRIDGE_API_TOKEN = process.env.BRIDGE_API_SERVER_TOKEN;
const BRIDGE_ENDPOINT   = 'https://api.bridgedataoutput.com/api/v2/OData/stellar/Property';

// Your real-estate vertical + brokerage org (seed these once; set as env for safety)
const RE_VERTICAL_ID = process.env.RE_VERTICAL_ID!;   // verticals.id where slug='real-estate'
const RE_ORG_ID      = process.env.RE_ORG_ID!;        // organizations.id (LPT/Bridges brokerage)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // optional: ?area=Tampa to filter by city; ?pages=3 to pull more
    const city   = searchParams.get('area');
    const maxPages = Math.min(parseInt(searchParams.get('pages') || '1'), 10);

    let synced = 0;
    let nextUrl: string | null =
      `${BRIDGE_ENDPOINT}?$filter=StandardStatus eq 'Active'` +
      (city ? ` and City eq '${city}'` : '') +
      `&$top=50&$expand=Media&$orderby=ModificationTimestamp desc`;

    for (let page = 0; page < maxPages && nextUrl; page++) {
      const response: Response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${BRIDGE_API_TOKEN}`,
          'Accept-Encoding': 'gzip, deflate',
        },
        next: { revalidate: 900 }, // 15-min cache
      });
      if (!response.ok) throw new Error(`Bridge API status ${response.status}`);

      const json: any = await response.json();
      const listings: any[] = json.value || [];
      nextUrl = json['@odata.nextLink'] || null; // RESO pagination

      if (listings.length === 0) break;

      const formatted = listings.map((item: any) => {
        const photos = item.Media ? item.Media.map((m: any) => m.MediaURL).filter(Boolean) : [];
        const address = `${item.UnparsedAddress || ''}, ${item.City || ''}, ${item.StateOrProvince || ''} ${item.PostalCode || ''}`
          .replace(/\s+,/g, ',').trim();
        return {
          // schema columns
          listing_id: item.ListingId,
          org_id: RE_ORG_ID,
          vertical_id: RE_VERTICAL_ID,
          title: address || item.ListingId,
          status: (item.StandardStatus || 'Active').toLowerCase() === 'active' ? 'active' : 'inactive',
          // rich MLS fields live in attributes JSONB (schema-safe, future-proof)
          attributes: {
            address,
            price: item.ListPrice ? parseFloat(item.ListPrice) : 0,
            beds: item.BedroomsTotal ?? 0,
            baths: item.BathroomsTotalInteger ?? 0,
            sqft: item.LivingArea ?? null,
            property_type: item.PropertyType ?? null,
            city: item.City ?? null,
            postal_code: item.PostalCode ?? null,
            latitude: item.Latitude ?? null,
            longitude: item.Longitude ?? null,
            photos,
            showing_instructions:
              item.ShowingInstructions ||
              'Contact the listing agent via Bridges Live for a live showing.',
            mls_status: item.StandardStatus,
            modification_ts: item.ModificationTimestamp ?? null,
            source: 'stellar-mls',
          },
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('listings')
        .upsert(formatted, { onConflict: 'listing_id' });
      if (error) throw new Error(`Supabase upsert: ${error.message}`);
      synced += formatted.length;
    }

    // audit trail
    await supabase.from('audit_logs').insert({
      action: 'sync.stellar_mls', entity: 'listings',
      meta: { synced, city, at: new Date().toISOString() },
    });

    return NextResponse.json({ success: true, syncedCount: synced, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error('MLS Sync Pipeline Error:', err?.message);
    return NextResponse.json({ error: err?.message || 'sync failed' }, { status: 500 });
  }
}
