-- ============================================================
-- 006 — Real listings cache, social videos for the stream grid, small settings store,
-- and removal of the old demo listings/streams. Idempotent. Run after 005.
-- ============================================================
create table if not exists mls_listings (
  id text primary key,              -- "mls:<ListingKey>" or "realty:<zpid>"
  source text not null,             -- stellar-mls | realtyapi
  mls_number text, status text not null default 'active',
  price numeric, address text, city text, state text, zip text,
  beds numeric, baths numeric, sqft numeric, property_type text, remarks text,
  photos jsonb default '[]'::jsonb, list_office text, list_agent text,
  lat double precision, lng double precision, url text,
  modified_at timestamptz, synced_at timestamptz
);
create index if not exists mls_listings_status_idx on mls_listings(status, modified_at desc);
alter table mls_listings enable row level security;

create table if not exists social_videos (
  id text primary key,              -- "youtube:<id>", "instagram:<id>", "tiktok:<id>", "bridges:<recording uid>"
  platform text not null, external_id text, title text, thumbnail text,
  media_url text, embed_url text, permalink text, published_at timestamptz,
  is_live boolean default false, viewers int, upcoming boolean default false, scheduled_at timestamptz,
  hidden boolean default false, source text, synced_at timestamptz
);
alter table social_videos enable row level security;

create table if not exists app_settings (
  key text primary key, value jsonb, updated_at timestamptz default now()
);
alter table app_settings enable row level security;

-- No demo data: end every stream that isn't a real agent's or the owner's, and archive the
-- demo listings attached to them.
update streams set status = 'ended'
 where status in ('live', 'pending_review')
   and coalesce(meta->>'applicant', 'false') <> 'true'
   and coalesce(meta->>'owner', 'false') <> 'true';
update listings l set status = 'archived'
 where exists (select 1 from show_listings sl join streams s on s.show_id = sl.show_id
               where sl.listing_id = l.id
                 and coalesce(s.meta->>'applicant', 'false') <> 'true'
                 and coalesce(s.meta->>'owner', 'false') <> 'true');
-- …and remove the demo/test chat attached to those retired streams.
delete from chat_messages where stream_id in (select id from streams
  where coalesce(meta->>'applicant', 'false') <> 'true' and coalesce(meta->>'owner', 'false') <> 'true');
delete from comment_events where stream_id in (select id from streams
  where coalesce(meta->>'applicant', 'false') <> 'true' and coalesce(meta->>'owner', 'false') <> 'true');
