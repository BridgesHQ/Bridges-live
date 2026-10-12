-- >>>>>>>>>> schema.sql
-- ============================================================
-- Bridges Global — Supabase PostgreSQL Schema
-- Multi-tenant, vertical-agnostic, compliance-aware.
-- Run in Supabase SQL editor. RLS policies at bottom.
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Run order: schema.sql → migrations/002_live_commerce.sql → seed.sql
-- (or just `npm run db:migrate` with DATABASE_URL set).
-- ============================================================
create extension if not exists "uuid-ossp";

-- ---------- VERTICALS (real-estate, matcha, global-trade, nonprofit-housing) ----------
create table if not exists verticals (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,              -- 'real-estate' | 'matcha' | 'global-trade' | 'nonprofit-housing'
  name text not null,
  compliance_rules jsonb default '{}'::jsonb,   -- e.g. {"license_required":true,"escrow_required":true}
  created_at timestamptz default now()
);

-- ---------- ORGANIZATIONS (tenants: brokerage / merchant / external agent) ----------
create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  vertical_id uuid references verticals(id),
  name text not null,
  subdomain text unique,                  -- white-label: agent.bridges…, brokerage.bridges…
  plan text default 'agent',              -- agent | brokerage | merchant | enterprise
  sponsoring_broker text,                 -- external agent disclosure
  created_at timestamptz default now()
);

-- ---------- USERS / ROLES ----------
do $$ begin
  create type user_role as enum
    ('consumer','selling_agent','listing_broker','external_merchant','platform_admin');
exception when duplicate_object then null; end $$;

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),   -- mirrors auth.users.id
  org_id uuid references organizations(id),
  email text unique not null,
  full_name text,
  role user_role default 'consumer',
  mfa_enabled boolean default false,
  created_at timestamptz default now()
);

create table if not exists licenses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  type text,                              -- 'FL-RE' | 'TX-RE' | 'dealer'
  number text,
  state text,
  status text default 'pending',          -- pending | verified | expired
  expires_at date
);

-- ---------- LISTINGS (= Item; attributes vary by vertical) ----------
create table if not exists listings (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id),
  vertical_id uuid references verticals(id),
  title text not null,
  attributes jsonb default '{}'::jsonb,    -- RE: address/beds/price; matcha: sku/price
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists property_authorizations (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid references listings(id) on delete cascade,
  user_id uuid references users(id),
  status text default 'pending',
  source text,                             -- MLS | IDX | builder | manual
  created_at timestamptz default now()
);

-- ---------- LIVE STREAMS ----------
create table if not exists shows (
  id uuid primary key default uuid_generate_v4(),
  host_id uuid references users(id),
  org_id uuid references organizations(id),
  vertical_id uuid references verticals(id),
  title text,
  category text,
  scheduled_at timestamptz,
  status text default 'scheduled',         -- scheduled | live | ended
  created_at timestamptz default now()
);

create table if not exists show_listings (
  show_id uuid references shows(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  primary key (show_id, listing_id)
);

create table if not exists streams (
  id uuid primary key default uuid_generate_v4(),
  show_id uuid unique references shows(id) on delete cascade,
  provider text default 'cloudflare',      -- cloudflare | ivs | livekit
  ingest_url text,
  playback_url text,
  room_id text,                            -- websocket room
  status text default 'idle',              -- idle | live | ended
  viewer_count int default 0,
  created_at timestamptz default now()
);

create table if not exists stream_destinations (        -- social multicast targets
  id uuid primary key default uuid_generate_v4(),
  stream_id uuid references streams(id) on delete cascade,
  platform text,                           -- youtube | tiktok | instagram | facebook
  public_url text,
  status text default 'pending'
);

create table if not exists chat_messages (              -- live chat (also cached in Redis)
  id uuid primary key default uuid_generate_v4(),
  stream_id uuid references streams(id) on delete cascade,
  user_id uuid references users(id),
  display_name text,
  body text,
  created_at timestamptz default now()
);

-- ---------- ENGAGEMENT → LEADS → APPOINTMENTS ----------
create table if not exists engagements (
  id uuid primary key default uuid_generate_v4(),
  show_id uuid references shows(id) on delete cascade,
  viewer_id uuid references users(id),
  type text,                               -- watch | question | intent | showing_request
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  engagement_id uuid references engagements(id),
  listing_id uuid references listings(id),
  host_id uuid references users(id),
  org_id uuid references organizations(id),
  first_name text,
  email text,
  phone text,
  source text,
  stage text default 'New',
  priority text default 'High',
  created_at timestamptz default now()
);
-- The production `leads` table pre-dates this schema (site forms write
-- first_name/email/phone/market/stage/priority/source/notes). Make sure every
-- column exists on an older table before policies reference them.
alter table leads add column if not exists engagement_id uuid references engagements(id);
alter table leads add column if not exists listing_id uuid references listings(id);
alter table leads add column if not exists host_id uuid references users(id);
alter table leads add column if not exists org_id uuid references organizations(id);
alter table leads add column if not exists first_name text;
alter table leads add column if not exists email text;
alter table leads add column if not exists phone text;
alter table leads add column if not exists source text;
alter table leads add column if not exists stage text default 'New';
alter table leads add column if not exists priority text default 'High';
alter table leads add column if not exists market text;
alter table leads add column if not exists notes text;
alter table leads add column if not exists created_at timestamptz default now();

-- lead_id matches whatever type leads.id already has (older tables may use bigint).
do $$ declare t text; begin
  select format_type(a.atttypid, a.atttypmod) into t from pg_attribute a
   where a.attrelid = 'public.leads'::regclass and a.attname = 'id';
  execute format('create table if not exists appointments (
    id uuid primary key default uuid_generate_v4(),
    lead_id %s references leads(id) on delete cascade,
    scheduled_at timestamptz,
    status text default ''requested''
  )', t);
end $$;

-- ---------- E-COMMERCE (Matcha / Global Trade) ----------
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id),
  buyer_email text,
  currency text default 'usd',
  amount numeric(12,2),
  stripe_payment_intent text,
  status text default 'pending',           -- pending | paid | fulfilled | refunded
  items jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id),
  plan text,
  stripe_subscription_id text,
  status text default 'active',
  created_at timestamptz default now()
);

-- ---------- TRANSACTIONS / REVENUE (commission via brokerage, not SaaS) ----------
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid references appointments(id),
  amount numeric(14,2),
  commission numeric(14,2),
  brokerage_id uuid references organizations(id),   -- commission routes here, NOT platform
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists revenue_events (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid references transactions(id),
  type text,                               -- commission | referral | subscription | lead_fee | ad
  amount numeric(14,2),
  routed_to_brokerage boolean default false,
  referral_agreement_ref text,
  created_at timestamptz default now()
);

-- ---------- ESCROW EVENT LOGS (software NEVER holds funds) ----------
create table if not exists escrow_events (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid references transactions(id),
  processor text,                          -- earnnest | payload
  external_ref text,
  amount numeric(14,2),
  state text default 'requested',          -- requested | collected | deposited | refunded
  agreement_at timestamptz,                -- contract execution time
  deposit_due_by timestamptz,              -- agreement_at + 3 FL business days
  deposited_at timestamptz,
  escrow_account text,                     -- FL bank / licensed title escrow
  breach_flag boolean default false,
  created_at timestamptz default now()
);

-- ---------- 501(c)(3) NONPROFIT (isolated) ----------
create table if not exists housing_resources (
  id uuid primary key default uuid_generate_v4(),
  type text,                               -- workshop | guide | grant-program
  title text,
  body text,
  is_nonprofit boolean default true,
  created_at timestamptz default now()
);

create table if not exists attendees (                   -- workshop / event attendees (nonprofit)
  id uuid primary key default uuid_generate_v4(),
  resource_id uuid references housing_resources(id) on delete cascade,
  name text,
  email text,
  registered_at timestamptz default now()
);

create table if not exists donations (                   -- nonprofit only; never commingled
  id uuid primary key default uuid_generate_v4(),
  donor_name text,
  amount numeric(14,2),
  source text,                             -- grant | individual
  restricted boolean default false,
  created_at timestamptz default now()
);

-- ---------- AUDIT LOGS ----------
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid,
  actor_id uuid,
  action text,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW-LEVEL SECURITY (tenant + role isolation)
-- ============================================================
alter table users enable row level security;
alter table listings enable row level security;
alter table leads enable row level security;
alter table orders enable row level security;
alter table escrow_events enable row level security;
alter table donations enable row level security;
alter table housing_resources enable row level security;

-- helper: current user's org
create or replace function current_org() returns uuid language sql stable as $$
  select org_id from users where id = auth.uid()
$$;
create or replace function current_role_val() returns user_role language sql stable as $$
  select role from users where id = auth.uid()
$$;

-- leads: host sees own org's leads; platform_admin sees all
drop policy if exists leads_tenant on leads;
create policy leads_tenant on leads for select using (
  org_id = current_org() or current_role_val() = 'platform_admin'
);
drop policy if exists leads_insert on leads;
create policy leads_insert on leads for insert with check ( true );  -- public forms insert

-- listings: org members manage own; public can read active
drop policy if exists listings_read on listings;
create policy listings_read on listings for select using ( status='active' or org_id=current_org() );
drop policy if exists listings_write on listings;
create policy listings_write on listings for all using ( org_id=current_org() );

-- orders: buyer/org scoped
drop policy if exists orders_tenant on orders;
create policy orders_tenant on orders for select using ( org_id=current_org() or current_role_val()='platform_admin' );

-- escrow: brokerage + admin only, NEVER consumers
drop policy if exists escrow_read on escrow_events;
create policy escrow_read on escrow_events for select using (
  current_role_val() in ('listing_broker','platform_admin')
);

-- nonprofit isolation: commercial roles cannot read donations
drop policy if exists donations_isolated on donations;
create policy donations_isolated on donations for select using (
  current_role_val() = 'platform_admin'
);
drop policy if exists housing_public on housing_resources;
create policy housing_public on housing_resources for select using ( is_nonprofit = true );

-- MLS sync support: add listing_id + unique constraint for upsert onConflict
alter table listings add column if not exists listing_id text;
create unique index if not exists listings_listing_id_uidx on listings(listing_id);


-- >>>>>>>>>> migrations/002_live_commerce.sql
-- ============================================================
-- 002 — Live commerce engine (streams, chat, PayPal orders + holds,
-- Command Center comment_events). Idempotent. Run after schema.sql.
-- ============================================================

-- ---------- streams: display metadata + public playback ----------
alter table streams add column if not exists meta jsonb default '{}'::jsonb;
alter table streams add column if not exists updated_at timestamptz default now();
alter table shows add column if not exists meta jsonb default '{}'::jsonb;

-- ---------- chat_messages: moderation + intent (Command Center) ----------
alter table chat_messages add column if not exists intent text default 'none';
alter table chat_messages add column if not exists moderation text default 'visible';

-- ---------- orders: one engine for matcha purchases AND property holds ----------
-- kind = 'purchase' (PayPal intent CAPTURE) | 'hold' (PayPal intent AUTHORIZE — funds held, never auto-captured)
alter table orders add column if not exists kind text default 'purchase';
alter table orders add column if not exists provider text default 'paypal';
alter table orders add column if not exists provider_order_id text;
alter table orders add column if not exists provider_capture_id text;       -- capture id (purchase) or authorization id (hold)
alter table orders add column if not exists stream_id uuid references streams(id) on delete set null;
alter table orders add column if not exists listing_id uuid references listings(id) on delete set null;
alter table orders add column if not exists buyer_name text;
alter table orders add column if not exists buyer_phone text;
alter table orders add column if not exists lead_ref text;                   -- leads.id as text (type-agnostic)
alter table orders add column if not exists meta jsonb default '{}'::jsonb;
alter table orders add column if not exists updated_at timestamptz default now();
create unique index if not exists orders_provider_order_uidx on orders(provider, provider_order_id);
create index if not exists orders_stream_idx on orders(stream_id);

-- leads: which live stream a lead came from
alter table leads add column if not exists stream_id uuid references streams(id) on delete set null;

-- ---------- Command Center: unified comment stream ----------
do $$ declare t text; begin
  select format_type(a.atttypid, a.atttypmod) into t from pg_attribute a
   where a.attrelid = 'public.leads'::regclass and a.attname = 'id';
  execute format('create table if not exists comment_events (
    id uuid primary key default uuid_generate_v4(),
    show_id uuid references shows(id) on delete cascade,
    stream_id uuid references streams(id) on delete cascade,
    host_id uuid references users(id),
    org_id uuid references organizations(id),
    item_id uuid references listings(id),
    platform text default ''onsite'',
    external_id text,
    author text,
    body text,
    intent text default ''none'',
    moderation text default ''visible'',
    routed_lead_id %s references leads(id),
    campaign_id uuid,
    created_at timestamptz default now()
  )', t);
end $$;
create index if not exists comment_events_show_idx on comment_events(show_id);
create index if not exists comment_events_intent_idx on comment_events(intent);

-- ---------- RLS for new/extended tables ----------
-- The Node server uses the service-role key (bypasses RLS). Public (anon) access:
alter table streams enable row level security;
alter table shows enable row level security;
alter table show_listings enable row level security;
alter table organizations enable row level security;
alter table verticals enable row level security;
alter table chat_messages enable row level security;
alter table comment_events enable row level security;

drop policy if exists streams_public_read on streams;
create policy streams_public_read on streams for select using ( status in ('live','idle') );
drop policy if exists shows_public_read on shows;
create policy shows_public_read on shows for select using ( true );
drop policy if exists show_listings_public_read on show_listings;
create policy show_listings_public_read on show_listings for select using ( true );
drop policy if exists orgs_public_read on organizations;
create policy orgs_public_read on organizations for select using ( true );
drop policy if exists verticals_public_read on verticals;
create policy verticals_public_read on verticals for select using ( true );
drop policy if exists chat_public_read on chat_messages;
create policy chat_public_read on chat_messages for select using ( moderation = 'visible' );
-- comment_events: staff only (no anon policy = no anon access)

-- Site lead forms post straight to /rest/v1/leads with the publishable (anon) key.
grant insert on table leads to anon, authenticated;
grant usage on all sequences in schema public to anon, authenticated;  -- for serial ids on older leads tables


-- >>>>>>>>>> migrations/003_lead_pipeline.sql
-- ============================================================
-- 003 — Lead pipeline: tracking fields, delivery log, 5-touch follow-ups,
-- unsubscribes, and scraped prospects (kept separate from opted-in leads).
-- Idempotent. Run after 002.
-- ============================================================
create extension if not exists "uuid-ossp";
-- ============================================================
alter table leads add column if not exists page_url text;
alter table leads add column if not exists utm jsonb;
alter table leads add column if not exists sms_consent boolean default false;

-- one row per delivery attempt (alert SMS, alert email, CRM, sequence) — powers the admin Pipeline tab
create table if not exists lead_events (
  id uuid primary key default uuid_generate_v4(),
  lead_ref text,            -- leads.id as text (works for uuid or bigint ids)
  email text,
  type text not null,       -- routed | alert_sms | alert_email | crm | sequence
  status text,              -- new | update | sent | skipped | failed | scheduled
  detail text,
  created_at timestamptz default now()
);
create index if not exists lead_events_email_idx on lead_events(email, type, created_at desc);

create table if not exists lead_followups (
  id uuid primary key default uuid_generate_v4(),
  lead_ref text, email text not null, phone text, first_name text, market text, source text,
  sms_consent boolean default false,
  step int not null, channel text not null,
  status text not null default 'pending',   -- pending | sent | skipped | failed | cancelled
  send_at timestamptz not null, sent_at timestamptz, detail text,
  created_at timestamptz default now()
);
create index if not exists lead_followups_due_idx on lead_followups(status, send_at);
create index if not exists lead_followups_email_idx on lead_followups(email);

create table if not exists lead_unsubscribes (
  email text primary key,
  created_at timestamptz default now()
);
-- (the local store uses an id column; harmless extra here)
alter table lead_unsubscribes add column if not exists id uuid default uuid_generate_v4();

-- Public posts from people saying they're moving to Tampa Bay. NOT leads: they never opted in,
-- so they are never auto-emailed or texted — you review and reach out personally.
create table if not exists prospects (
  id uuid primary key default uuid_generate_v4(),
  platform text not null,          -- reddit | facebook | other
  external_id text not null,
  author text, title text, body text, url text, community text,
  matched_query text, posted_at timestamptz,
  status text not null default 'new',   -- new | contacted | ignored
  created_at timestamptz default now(),
  unique (platform, external_id)
);

-- all server-side only (service role); no browser access
alter table lead_events enable row level security;
alter table lead_followups enable row level security;
alter table lead_unsubscribes enable row level security;
alter table prospects enable row level security;


-- >>>>>>>>>> migrations/004_streams_private.sql
-- ============================================================
-- 004 — Keep stream host details private.
-- streams.meta holds agent email/phone, the Cloudflare live-input id and a hash of the
-- private Go-Live link. The Bridges server reads streams with the service key, so the public
-- (anon) read policy isn't needed. Idempotent.
-- ============================================================
drop policy if exists streams_public_read on streams;
alter table streams enable row level security;


-- >>>>>>>>>> migrations/005_content_and_cleanup.sql
-- ============================================================
-- 005 — Today's Content (daily video scripts) + real-estate-only cleanup.
-- Idempotent. Run after 004.
-- ============================================================
create extension if not exists "uuid-ossp";

create table if not exists content_posts (
  id uuid primary key default uuid_generate_v4(),
  post_date date not null unique,
  theme text,
  status text not null default 'draft',   -- draft | filmed | posted
  source text,                            -- ai | template
  data jsonb not null default '{}'::jsonb, -- title, hook, script[], caption, hashtags[], shotlist[] …
  emailed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);
alter table content_posts enable row level security; -- server (service key) only

-- leads: status set from the admin Leads view
alter table leads add column if not exists stage text default 'New';

-- Real estate only: retire the old matcha / demo streams so they never reappear on the grid.
-- (The server also hides demo streams unless SHOW_SEED_STREAMS=true.)
update streams set status = 'ended'
 where status = 'live'
   and coalesce(meta->>'applicant', 'false') <> 'true'
   and coalesce(meta->>'owner', 'false') <> 'true';


-- >>>>>>>>>> migrations/006_listings_social.sql
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


-- >>>>>>>>>> seed
-- ============================================================
-- Bridges Live — seed data (verticals, orgs, host, listings, live streams).
-- GENERATED by `npm run db:build-sql` from server/seed-data.js. Idempotent.
-- Run after schema.sql and migrations/002_live_commerce.sql.
-- ============================================================
insert into verticals (slug, name, compliance_rules) values
  ('real-estate', 'Real Estate', '{"license_required":true,"escrow_required":true,"holds_require_broker_signoff":true}'::jsonb),
  ('nonprofit-housing', 'Nonprofit Housing (501c3)', '{"nonprofit":true,"commercial_routing":false}'::jsonb)
on conflict (slug) do update set name = excluded.name, compliance_rules = excluded.compliance_rules;

insert into organizations (id, vertical_id, name, plan, sponsoring_broker) values
  ('410b46d5-bf9f-581d-a892-4049016b56e4', (select id from verticals where slug = 'real-estate'), 'Bridges Global', 'brokerage', 'LPT Realty')
on conflict (id) do update set vertical_id = excluded.vertical_id, name = excluded.name, plan = excluded.plan, sponsoring_broker = excluded.sponsoring_broker;

insert into users (org_id, email, full_name, role) values
  ('410b46d5-bf9f-581d-a892-4049016b56e4', 'dd@bridgesglobal.co', 'Dorota Maslowska', 'listing_broker')
on conflict (email) do update set org_id = excluded.org_id, full_name = excluded.full_name, role = excluded.role;

