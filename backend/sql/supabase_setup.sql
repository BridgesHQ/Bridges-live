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


-- >>>>>>>>>> seed
-- ============================================================
-- Bridges Live — seed data (verticals, orgs, host, listings, live streams).
-- GENERATED by `npm run db:build-sql` from server/seed-data.js. Idempotent.
-- Run after schema.sql and migrations/002_live_commerce.sql.
-- ============================================================
insert into verticals (slug, name, compliance_rules) values
  ('real-estate', 'Real Estate', '{"license_required":true,"escrow_required":true,"holds_require_broker_signoff":true}'::jsonb),
  ('matcha', 'Bridges Matcha', '{"license_required":false,"escrow_required":false}'::jsonb),
  ('global-trade', 'Global Trade', '{"license_required":false,"escrow_required":false,"checkout":"rfq"}'::jsonb),
  ('nonprofit-housing', 'Nonprofit Housing (501c3)', '{"nonprofit":true,"commercial_routing":false}'::jsonb)
on conflict (slug) do update set name = excluded.name, compliance_rules = excluded.compliance_rules;

insert into organizations (id, vertical_id, name, plan, sponsoring_broker) values
  ('410b46d5-bf9f-581d-a892-4049016b56e4', (select id from verticals where slug = 'real-estate'), 'Bridges Global', 'brokerage', 'LPT Realty'),
  ('b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'Emerald Living', 'brokerage', 'LPT Realty'),
  ('dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Waterset Living', 'brokerage', 'LPT Realty'),
  ('07d15cb4-39aa-54aa-a60d-1fca99924222', (select id from verticals where slug = 'real-estate'), 'Bridges TX', 'brokerage', 'LPT Realty'),
  ('06011a43-5002-544e-a520-5b621480a872', (select id from verticals where slug = 'real-estate'), 'Skyline Res.', 'brokerage', 'LPT Realty'),
  ('88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Triple Creek Homes', 'brokerage', 'LPT Realty'),
  ('4a553e66-0dd9-5a29-aecd-8b47cc578277', (select id from verticals where slug = 'real-estate'), 'NRR Homes', 'brokerage', 'LPT Realty'),
  ('296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'Dorota M.', 'brokerage', 'LPT Realty'),
  ('904dfb02-1f07-5f20-ad92-da98640ec456', (select id from verticals where slug = 'matcha'), 'Bridges Matcha', 'merchant', null)
on conflict (id) do update set vertical_id = excluded.vertical_id, name = excluded.name, plan = excluded.plan, sponsoring_broker = excluded.sponsoring_broker;

insert into users (org_id, email, full_name, role) values
  ('410b46d5-bf9f-581d-a892-4049016b56e4', 'dd@bridgesglobal.co', 'Dorota Maslowska', 'listing_broker')
on conflict (email) do update set org_id = excluded.org_id, full_name = excluded.full_name, role = excluded.role;

insert into listings (id, org_id, vertical_id, title, status, attributes) values
  ('8becbc28-a38d-5d79-af0d-066fd19cf49c', 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'Triple Creek — Model B', 'active', '{"kind":"property","price_label":"From the $340s","location":"Riverview, FL","image":"https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('9623fb4f-3812-5d93-a67f-0c1477ce5e5b', 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Waterfront Estate — Apollo Beach', 'active', '{"kind":"property","price_label":"$1.2M","location":"Apollo Beach, FL","image":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('e3770602-6966-55da-add7-e0976d45d461', '07d15cb4-39aa-54aa-a60d-1fca99924222', (select id from verticals where slug = 'real-estate'), 'Channelside Bay Lofts', 'active', '{"kind":"property","price_label":"From $1,950/mo","location":"Downtown Tampa, FL","image":"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('2734d310-f89c-5a4f-abce-82a5e665ca9d', 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'North River Ranch', 'active', '{"kind":"property","price_label":"From the $330s","location":"Parrish, FL","image":"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('233d018e-780a-598c-ab3a-bf66b43acd9f', '06011a43-5002-544e-a520-5b621480a872', (select id from verticals where slug = 'real-estate'), 'Relocation Tour — Wesley Chapel', 'active', '{"kind":"property","price_label":"Buyer tour","location":"Wesley Chapel, FL","image":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('471221eb-8489-5ad8-a830-26df1e3561e7', '07d15cb4-39aa-54aa-a60d-1fca99924222', (select id from verticals where slug = 'real-estate'), 'Downtown Penthouse', 'active', '{"kind":"property","price_label":"$895K","location":"Austin, TX","image":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('9662c6e0-d86c-5733-a5b9-c2f4043fad5b', '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Bexley New Homes', 'active', '{"kind":"property","price_label":"From the $400s","location":"Land O'' Lakes, FL","image":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('02761ad2-e9ca-55bf-a8e3-9a7a29384217', '4a553e66-0dd9-5a29-aecd-8b47cc578277', (select id from verticals where slug = 'real-estate'), 'Epperson Lagoon', 'active', '{"kind":"property","price_label":"From the $390s","location":"Wesley Chapel, FL","image":"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('2dc4980e-52c9-56b8-afba-9b24737247f0', 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Emerald Luxury Apartments', 'active', '{"kind":"property","price_label":"From $1,499/mo","location":"Tampa, FL","image":"https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('87febb43-7518-53d5-ab41-77d0aca3cc32', '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'SoHo District Residences', 'active', '{"kind":"property","price_label":"From $1,795/mo","location":"Tampa, FL","image":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('17bd2769-734b-580e-ad23-ecedbd72e7c4', '4a553e66-0dd9-5a29-aecd-8b47cc578277', (select id from verticals where slug = 'real-estate'), 'Waterset Lakeside', 'active', '{"kind":"property","price_label":"From $1,450/mo","location":"Apollo Beach, FL","image":"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('832a6da8-310e-5bc2-a931-c94615b71b88', 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'SouthShore Bay Lagoon', 'active', '{"kind":"property","price_label":"From the $320s","location":"Wimauma, FL","image":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('fab8e77a-0cd2-5d07-ae15-fda2533b7309', '06011a43-5002-544e-a520-5b621480a872', (select id from verticals where slug = 'real-estate'), 'Lakewood Ranch Estate', 'active', '{"kind":"property","price_label":"$785K","location":"Lakewood Ranch, FL","image":"https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('69201982-510c-573b-a48a-698998f9d78f', 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Clearwater Beach Condo', 'active', '{"kind":"property","price_label":"$640K","location":"Clearwater, FL","image":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('5ec68b84-d118-5d37-aa0f-60a8c03a210b', 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Sarasota Bayfront', 'active', '{"kind":"property","price_label":"$1.4M","location":"Sarasota, FL","image":"https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('460dba04-2d81-5f11-abb4-f27d3441f3c5', 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Sun City Center Villa', 'active', '{"kind":"property","price_label":"From the $270s","location":"Sun City Center, FL","image":"https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('49928a43-5128-5fbe-aeb2-bd031fe11d3b', '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Brandon Family Home', 'active', '{"kind":"property","price_label":"$425K","location":"Brandon, FL","image":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('b0e326d6-368c-5ae6-adca-ae946341dfa2', '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'FishHawk Ranch Tour', 'active', '{"kind":"property","price_label":"$510K","location":"Lithia, FL","image":"https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('a519f74e-e629-59e0-ace9-04c78d057003', '4a553e66-0dd9-5a29-aecd-8b47cc578277', (select id from verticals where slug = 'real-estate'), 'Ruskin New Build', 'active', '{"kind":"property","price_label":"From the $310s","location":"Ruskin, FL","image":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('34d05c5b-5ad5-5001-ad69-526c68baa931', '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'Ybor City Lofts', 'active', '{"kind":"property","price_label":"From $1,650/mo","location":"Ybor City, FL","image":"https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('3952bfda-629c-5583-a865-5e58088991e6', '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'Westshore Marina Club', 'active', '{"kind":"property","price_label":"From $1,875/mo","location":"Tampa, FL","image":"https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('cba836d7-e9d3-560a-a224-6fb88e13a32f', '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Skyline Residences', 'active', '{"kind":"property","price_label":"From $1,495/mo","location":"Tampa, FL","image":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('d7c505e6-c8aa-5432-ad21-1ba7b53cd759', 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Hyde Park Luxury', 'active', '{"kind":"property","price_label":"$2,100/mo","location":"Hyde Park, Tampa","image":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('dfd4d549-3c07-58bb-a530-1854d1a53cd0', '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'Bradenton Riverfront', 'active', '{"kind":"property","price_label":"$389K","location":"Bradenton, FL","image":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('35641ea3-560c-5c77-af83-3918dce8f39c', 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'Wiregrass Grand Opening', 'active', '{"kind":"property","price_label":"From the $380s","location":"Wesley Chapel, FL","image":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('9ff9c2e2-8bf6-5d30-a7aa-641118c5c30d', '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Union Park Collection', 'active', '{"kind":"property","price_label":"From the $385s","location":"Wesley Chapel, FL","image":"https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80","hold":{"amount":500,"currency":"USD","label":"$500 refundable hold"}}'::jsonb),
  ('9edd9c10-1071-5eb8-a97a-21b32cfb032a', '904dfb02-1f07-5f20-ad92-da98640ec456', (select id from verticals where slug = 'matcha'), 'Bridges Matcha — Ceremonial Tasting', 'active', '{"kind":"product","product":{"id":"prod_matcha_30","name":"Ceremonial Matcha 30g (Uji, Kyoto)","price":30,"currency":"USD","addons":[{"id":"whisk","name":"Bamboo whisk","price":18},{"id":"bowl","name":"Chawan bowl","price":24},{"id":"tin","name":"Gift tin","price":8}]},"price_label":"$30 · Buy now","location":"Uji, Kyoto","image":"/assets/img/matcha.jpg"}'::jsonb)
on conflict (id) do update set org_id = excluded.org_id, vertical_id = excluded.vertical_id, title = excluded.title, status = excluded.status, attributes = excluded.attributes;

insert into shows (id, host_id, org_id, vertical_id, title, category, status) values
  ('a97b943c-a833-5dbe-a29b-cd5863077adb', (select id from users where email = 'dd@bridgesglobal.co'), 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'Triple Creek — Model B', 'new', 'live'),
  ('290b226c-0fbd-5cb2-a8f1-d096f6cc6370', (select id from users where email = 'dd@bridgesglobal.co'), 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Waterfront Estate — Apollo Beach', 'lux', 'live'),
  ('ae2072c4-1749-5164-a0bc-d4a9458d8ba8', (select id from users where email = 'dd@bridgesglobal.co'), '07d15cb4-39aa-54aa-a60d-1fca99924222', (select id from verticals where slug = 'real-estate'), 'Channelside Bay Lofts', 'apt', 'live'),
  ('c033e282-397d-52d6-a532-66e3e796382a', (select id from users where email = 'dd@bridgesglobal.co'), 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'North River Ranch', 'new', 'live'),
  ('9fb2877b-7595-5588-a06d-4d1c8c97fb46', (select id from users where email = 'dd@bridgesglobal.co'), '06011a43-5002-544e-a520-5b621480a872', (select id from verticals where slug = 'real-estate'), 'Relocation Tour — Wesley Chapel', 'reloc', 'live'),
  ('e3bd5291-4f23-5093-a9e3-bcf04dd18468', (select id from users where email = 'dd@bridgesglobal.co'), '07d15cb4-39aa-54aa-a60d-1fca99924222', (select id from verticals where slug = 'real-estate'), 'Downtown Penthouse', 'tx', 'live'),
  ('cf52cd5f-e272-5659-a474-a2bb6b2cc78d', (select id from users where email = 'dd@bridgesglobal.co'), '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Bexley New Homes', 'new', 'live'),
  ('2dbb653e-5ee0-5ec3-acb6-3d3e8eb64dbf', (select id from users where email = 'dd@bridgesglobal.co'), '4a553e66-0dd9-5a29-aecd-8b47cc578277', (select id from verticals where slug = 'real-estate'), 'Epperson Lagoon', 'new', 'live'),
  ('3432e830-2c79-59db-a440-7ccf678af053', (select id from users where email = 'dd@bridgesglobal.co'), 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Emerald Luxury Apartments', 'apt', 'live'),
  ('d79b3198-08a0-536e-ae84-4886455a5ac0', (select id from users where email = 'dd@bridgesglobal.co'), '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'SoHo District Residences', 'apt', 'live'),
  ('335d7bd8-ce33-5614-adc9-bdee537899ed', (select id from users where email = 'dd@bridgesglobal.co'), '4a553e66-0dd9-5a29-aecd-8b47cc578277', (select id from verticals where slug = 'real-estate'), 'Waterset Lakeside', 'apt', 'live'),
  ('bca0d374-86d7-5b1d-aae3-fcd6678f3870', (select id from users where email = 'dd@bridgesglobal.co'), 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'SouthShore Bay Lagoon', 'new', 'live'),
  ('ab076fb4-60d1-5134-abf2-37bd149780e1', (select id from users where email = 'dd@bridgesglobal.co'), '06011a43-5002-544e-a520-5b621480a872', (select id from verticals where slug = 'real-estate'), 'Lakewood Ranch Estate', 'lux', 'live'),
  ('60709146-8383-5b37-a57b-079ed1ff94c1', (select id from users where email = 'dd@bridgesglobal.co'), 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Clearwater Beach Condo', 'lux', 'live'),
  ('41d0aa71-87e0-5391-add9-af23dc53c4ea', (select id from users where email = 'dd@bridgesglobal.co'), 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Sarasota Bayfront', 'lux', 'live'),
  ('3ad90dcb-f941-54ba-a434-e346336fce23', (select id from users where email = 'dd@bridgesglobal.co'), 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Sun City Center Villa', 'new', 'live'),
  ('8e448ebf-6992-5a27-a6f0-6bd74e423f94', (select id from users where email = 'dd@bridgesglobal.co'), '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Brandon Family Home', 'new', 'live'),
  ('06309204-8716-5dee-a331-7fb34cb3776a', (select id from users where email = 'dd@bridgesglobal.co'), '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'FishHawk Ranch Tour', 'new', 'live'),
  ('5d3ace5c-e398-5263-a76e-a8d2545c456c', (select id from users where email = 'dd@bridgesglobal.co'), '4a553e66-0dd9-5a29-aecd-8b47cc578277', (select id from verticals where slug = 'real-estate'), 'Ruskin New Build', 'new', 'live'),
  ('7a591dc5-6b27-5355-aae2-6aa752909eca', (select id from users where email = 'dd@bridgesglobal.co'), '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'Ybor City Lofts', 'apt', 'live'),
  ('31265f0e-0ca3-5ee6-a161-e4ead23e831b', (select id from users where email = 'dd@bridgesglobal.co'), '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'Westshore Marina Club', 'apt', 'live'),
  ('c118dc9e-d0b8-53c5-a4e6-57158a47c416', (select id from users where email = 'dd@bridgesglobal.co'), '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Skyline Residences', 'apt', 'live'),
  ('cbe3ea0b-edfd-55a9-ad21-bdca5fa96134', (select id from users where email = 'dd@bridgesglobal.co'), 'dbb0f8ad-f40b-5fd0-a0e7-91159ef10ae2', (select id from verticals where slug = 'real-estate'), 'Hyde Park Luxury', 'apt', 'live'),
  ('861537f6-340b-599b-ae7e-c10156f1fe95', (select id from users where email = 'dd@bridgesglobal.co'), '296b3483-d8d9-5291-a69c-39532514d3c6', (select id from verticals where slug = 'real-estate'), 'Bradenton Riverfront', 'new', 'live'),
  ('52abe59e-34e3-5042-a687-eba32de814fc', (select id from users where email = 'dd@bridgesglobal.co'), 'b89d15e2-c709-58ed-ae13-cd4ec5d5a27f', (select id from verticals where slug = 'real-estate'), 'Wiregrass Grand Opening', 'new', 'live'),
  ('c7e16c4d-38b0-5230-af83-a0470537c7e8', (select id from users where email = 'dd@bridgesglobal.co'), '88b7910a-3565-52aa-af01-c886fc377994', (select id from verticals where slug = 'real-estate'), 'Union Park Collection', 'new', 'live'),
  ('5842e398-0167-5ff0-a46f-591e3d040f5d', (select id from users where email = 'dd@bridgesglobal.co'), '904dfb02-1f07-5f20-ad92-da98640ec456', (select id from verticals where slug = 'matcha'), 'Bridges Matcha — Live Ceremonial Tasting', 'commerce', 'live')
on conflict (id) do update set host_id = excluded.host_id, org_id = excluded.org_id, vertical_id = excluded.vertical_id, title = excluded.title, category = excluded.category, status = excluded.status;

insert into show_listings (show_id, listing_id) values
  ('a97b943c-a833-5dbe-a29b-cd5863077adb', '8becbc28-a38d-5d79-af0d-066fd19cf49c'),
  ('290b226c-0fbd-5cb2-a8f1-d096f6cc6370', '9623fb4f-3812-5d93-a67f-0c1477ce5e5b'),
  ('ae2072c4-1749-5164-a0bc-d4a9458d8ba8', 'e3770602-6966-55da-add7-e0976d45d461'),
  ('c033e282-397d-52d6-a532-66e3e796382a', '2734d310-f89c-5a4f-abce-82a5e665ca9d'),
  ('9fb2877b-7595-5588-a06d-4d1c8c97fb46', '233d018e-780a-598c-ab3a-bf66b43acd9f'),
  ('e3bd5291-4f23-5093-a9e3-bcf04dd18468', '471221eb-8489-5ad8-a830-26df1e3561e7'),
  ('cf52cd5f-e272-5659-a474-a2bb6b2cc78d', '9662c6e0-d86c-5733-a5b9-c2f4043fad5b'),
  ('2dbb653e-5ee0-5ec3-acb6-3d3e8eb64dbf', '02761ad2-e9ca-55bf-a8e3-9a7a29384217'),
  ('3432e830-2c79-59db-a440-7ccf678af053', '2dc4980e-52c9-56b8-afba-9b24737247f0'),
  ('d79b3198-08a0-536e-ae84-4886455a5ac0', '87febb43-7518-53d5-ab41-77d0aca3cc32'),
  ('335d7bd8-ce33-5614-adc9-bdee537899ed', '17bd2769-734b-580e-ad23-ecedbd72e7c4'),
  ('bca0d374-86d7-5b1d-aae3-fcd6678f3870', '832a6da8-310e-5bc2-a931-c94615b71b88'),
  ('ab076fb4-60d1-5134-abf2-37bd149780e1', 'fab8e77a-0cd2-5d07-ae15-fda2533b7309'),
  ('60709146-8383-5b37-a57b-079ed1ff94c1', '69201982-510c-573b-a48a-698998f9d78f'),
  ('41d0aa71-87e0-5391-add9-af23dc53c4ea', '5ec68b84-d118-5d37-aa0f-60a8c03a210b'),
  ('3ad90dcb-f941-54ba-a434-e346336fce23', '460dba04-2d81-5f11-abb4-f27d3441f3c5'),
  ('8e448ebf-6992-5a27-a6f0-6bd74e423f94', '49928a43-5128-5fbe-aeb2-bd031fe11d3b'),
  ('06309204-8716-5dee-a331-7fb34cb3776a', 'b0e326d6-368c-5ae6-adca-ae946341dfa2'),
  ('5d3ace5c-e398-5263-a76e-a8d2545c456c', 'a519f74e-e629-59e0-ace9-04c78d057003'),
  ('7a591dc5-6b27-5355-aae2-6aa752909eca', '34d05c5b-5ad5-5001-ad69-526c68baa931'),
  ('31265f0e-0ca3-5ee6-a161-e4ead23e831b', '3952bfda-629c-5583-a865-5e58088991e6'),
  ('c118dc9e-d0b8-53c5-a4e6-57158a47c416', 'cba836d7-e9d3-560a-a224-6fb88e13a32f'),
  ('cbe3ea0b-edfd-55a9-ad21-bdca5fa96134', 'd7c505e6-c8aa-5432-ad21-1ba7b53cd759'),
  ('861537f6-340b-599b-ae7e-c10156f1fe95', 'dfd4d549-3c07-58bb-a530-1854d1a53cd0'),
  ('52abe59e-34e3-5042-a687-eba32de814fc', '35641ea3-560c-5c77-af83-3918dce8f39c'),
  ('c7e16c4d-38b0-5230-af83-a0470537c7e8', '9ff9c2e2-8bf6-5d30-a7aa-641118c5c30d'),
  ('5842e398-0167-5ff0-a46f-591e3d040f5d', '9edd9c10-1071-5eb8-a97a-21b32cfb032a')
on conflict (show_id,listing_id) do nothing;

insert into streams (id, show_id, provider, room_id, playback_url, status, viewer_count, meta) values
  ('a01fd987-7752-5e07-aad0-7476111b16fe', '5842e398-0167-5ff0-a46f-591e3d040f5d', 'hls', 'room-matcha', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'live', 210, '{"host_name":"Bridges Matcha","category":"commerce","category_label":"Live Commerce","likes":1890,"thumbnail":"/assets/img/matcha.jpg","cta":"buy"}'::jsonb),
  ('34763fe8-0c26-50cb-ad54-e93d50207708', 'a97b943c-a833-5dbe-a29b-cd5863077adb', 'youtube', 'room-1', 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'live', 343, '{"host_name":"Emerald Living","category":"new","category_label":"New Construction","likes":4758,"thumbnail":"https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('e5668b63-69bd-5c39-ae25-b9f2d9b053da', '290b226c-0fbd-5cb2-a8f1-d096f6cc6370', 'youtube', 'room-2', null, 'live', 282, '{"host_name":"Waterset Living","category":"lux","category_label":"Luxury","likes":5425,"thumbnail":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('e3ea50eb-c382-57f9-a9a1-c0676448584f', 'ae2072c4-1749-5164-a0bc-d4a9458d8ba8', 'youtube', 'room-3', null, 'live', 280, '{"host_name":"Bridges TX","category":"apt","category_label":"Apartments","likes":2424,"thumbnail":"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('6bcd94b0-f610-5602-a8e9-cf0fa7169068', 'c033e282-397d-52d6-a532-66e3e796382a', 'youtube', 'room-4', null, 'live', 407, '{"host_name":"Emerald Living","category":"new","category_label":"New Construction","likes":4152,"thumbnail":"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('c5555edd-3e81-5089-a9e2-aff07ae76ce2', '9fb2877b-7595-5588-a06d-4d1c8c97fb46', 'youtube', 'room-5', null, 'live', 367, '{"host_name":"Skyline Res.","category":"reloc","category_label":"Relocation","likes":1533,"thumbnail":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('27117280-fd0d-5ba0-ac49-11a355ea0a2f', 'e3bd5291-4f23-5093-a9e3-bcf04dd18468', 'youtube', 'room-6', null, 'live', 514, '{"host_name":"Bridges TX","category":"tx","category_label":"Texas","likes":4585,"thumbnail":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('b40bba18-e9fb-524b-a6a8-db617201ef17', 'cf52cd5f-e272-5659-a474-a2bb6b2cc78d', 'youtube', 'room-7', null, 'live', 437, '{"host_name":"Triple Creek Homes","category":"new","category_label":"New Construction","likes":824,"thumbnail":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('5af7a6d2-51e7-550b-a7b1-599c316951bc', '2dbb653e-5ee0-5ec3-acb6-3d3e8eb64dbf', 'youtube', 'room-8', null, 'live', 439, '{"host_name":"NRR Homes","category":"new","category_label":"New Construction","likes":554,"thumbnail":"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('2e1dfb26-026b-513f-a47f-c9b993e23f52', '3432e830-2c79-59db-a440-7ccf678af053', 'youtube', 'room-9', null, 'live', 408, '{"host_name":"Waterset Living","category":"apt","category_label":"Apartments","likes":3475,"thumbnail":"https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('631b9149-a711-515e-ab6c-c9d06dcef108', 'd79b3198-08a0-536e-ae84-4886455a5ac0', 'youtube', 'room-10', null, 'live', 450, '{"host_name":"Triple Creek Homes","category":"apt","category_label":"Apartments","likes":5026,"thumbnail":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('730b7722-d6b0-5e70-a660-87cdc0830098', '335d7bd8-ce33-5614-adc9-bdee537899ed', 'youtube', 'room-11', null, 'live', 89, '{"host_name":"NRR Homes","category":"apt","category_label":"Apartments","likes":593,"thumbnail":"https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('8b32358e-71fb-5438-a8d7-bfc83f00de26', 'bca0d374-86d7-5b1d-aae3-fcd6678f3870', 'youtube', 'room-12', null, 'live', 172, '{"host_name":"Emerald Living","category":"new","category_label":"New Construction","likes":5805,"thumbnail":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('19449165-0400-540a-aaf3-8cdc2d170787', 'ab076fb4-60d1-5134-abf2-37bd149780e1', 'youtube', 'room-13', null, 'live', 299, '{"host_name":"Skyline Res.","category":"lux","category_label":"Luxury","likes":3461,"thumbnail":"https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('d29dddcb-0367-59ef-a02c-12cb2e669b51', '60709146-8383-5b37-a57b-079ed1ff94c1', 'youtube', 'room-14', null, 'live', 158, '{"host_name":"Waterset Living","category":"lux","category_label":"Luxury","likes":3058,"thumbnail":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('4291b059-d723-5fdd-a8ea-3aa8f19070fa', '41d0aa71-87e0-5391-add9-af23dc53c4ea', 'youtube', 'room-15', null, 'live', 383, '{"host_name":"Waterset Living","category":"lux","category_label":"Luxury","likes":5998,"thumbnail":"https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('70df9ca8-f6a4-5d3b-a000-79fa199397c9', '3ad90dcb-f941-54ba-a434-e346336fce23', 'youtube', 'room-16', null, 'live', 503, '{"host_name":"Waterset Living","category":"new","category_label":"New Construction","likes":4985,"thumbnail":"https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('0f9e97fc-f12f-5d3a-a467-ca24ff79f461', '8e448ebf-6992-5a27-a6f0-6bd74e423f94', 'youtube', 'room-17', null, 'live', 375, '{"host_name":"Triple Creek Homes","category":"new","category_label":"New Construction","likes":2029,"thumbnail":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('4b3e6439-054c-5597-a559-07a2919b2628', '06309204-8716-5dee-a331-7fb34cb3776a', 'youtube', 'room-18', null, 'live', 72, '{"host_name":"Dorota M.","category":"new","category_label":"New Construction","likes":4248,"thumbnail":"https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('1d7fba19-b6e3-567f-af69-553c4cc2baa7', '5d3ace5c-e398-5263-a76e-a8d2545c456c', 'youtube', 'room-19', null, 'live', 449, '{"host_name":"NRR Homes","category":"new","category_label":"New Construction","likes":845,"thumbnail":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('a5b85d14-7b66-5ea9-a6c0-83c4a68af5ca', '7a591dc5-6b27-5355-aae2-6aa752909eca', 'youtube', 'room-20', null, 'live', 190, '{"host_name":"Dorota M.","category":"apt","category_label":"Apartments","likes":3799,"thumbnail":"https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('250dd546-64dd-5ff1-a70f-aecdcc73f551', '31265f0e-0ca3-5ee6-a161-e4ead23e831b', 'youtube', 'room-21', null, 'live', 349, '{"host_name":"Dorota M.","category":"apt","category_label":"Apartments","likes":5334,"thumbnail":"https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('b99b7774-6d05-528f-ad38-ca4001f5b066', 'c118dc9e-d0b8-53c5-a4e6-57158a47c416', 'youtube', 'room-22', null, 'live', 340, '{"host_name":"Triple Creek Homes","category":"apt","category_label":"Apartments","likes":3011,"thumbnail":"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('fa02bb05-c42b-5ab7-a1a3-2bd5a4e80d26', 'cbe3ea0b-edfd-55a9-ad21-bdca5fa96134', 'youtube', 'room-23', null, 'live', 160, '{"host_name":"Waterset Living","category":"apt","category_label":"Apartments","likes":595,"thumbnail":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('4668f2b7-42fb-503c-ad7a-6d45f221d8ee', '861537f6-340b-599b-ae7e-c10156f1fe95', 'youtube', 'room-24', null, 'live', 95, '{"host_name":"Dorota M.","category":"new","category_label":"New Construction","likes":5213,"thumbnail":"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('7d250d55-cff4-5e8a-a2f7-5fff680bfd24', '52abe59e-34e3-5042-a687-eba32de814fc', 'youtube', 'room-25', null, 'live', 248, '{"host_name":"Emerald Living","category":"new","category_label":"New Construction","likes":2688,"thumbnail":"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb),
  ('4427c757-8360-5d5c-aa63-19dfb9c78377', 'c7e16c4d-38b0-5230-af83-a0470537c7e8', 'youtube', 'room-26', null, 'live', 61, '{"host_name":"Triple Creek Homes","category":"new","category_label":"New Construction","likes":3083,"thumbnail":"https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80","cta":"showing"}'::jsonb)
on conflict (id) do update set show_id = excluded.show_id, provider = excluded.provider, room_id = excluded.room_id, playback_url = excluded.playback_url, status = excluded.status, viewer_count = excluded.viewer_count, meta = excluded.meta;

