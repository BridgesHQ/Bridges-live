-- ============================================================
-- Bridges Global — Supabase PostgreSQL Schema
-- Multi-tenant, vertical-agnostic, compliance-aware.
-- Run in Supabase SQL editor. RLS policies at bottom.
-- ============================================================
create extension if not exists "uuid-ossp";

-- ---------- VERTICALS (real-estate, matcha, global-trade, nonprofit-housing) ----------
create table verticals (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,              -- 'real-estate' | 'matcha' | 'global-trade' | 'nonprofit-housing'
  name text not null,
  compliance_rules jsonb default '{}'::jsonb,   -- e.g. {"license_required":true,"escrow_required":true}
  created_at timestamptz default now()
);

-- ---------- ORGANIZATIONS (tenants: brokerage / merchant / external agent) ----------
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  vertical_id uuid references verticals(id),
  name text not null,
  subdomain text unique,                  -- white-label: agent.bridges…, brokerage.bridges…
  plan text default 'agent',              -- agent | brokerage | merchant | enterprise
  sponsoring_broker text,                 -- external agent disclosure
  created_at timestamptz default now()
);

-- ---------- USERS / ROLES ----------
create type user_role as enum
  ('consumer','selling_agent','listing_broker','external_merchant','platform_admin');

create table users (
  id uuid primary key default uuid_generate_v4(),   -- mirrors auth.users.id
  org_id uuid references organizations(id),
  email text unique not null,
  full_name text,
  role user_role default 'consumer',
  mfa_enabled boolean default false,
  created_at timestamptz default now()
);

create table licenses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  type text,                              -- 'FL-RE' | 'TX-RE' | 'dealer'
  number text,
  state text,
  status text default 'pending',          -- pending | verified | expired
  expires_at date
);

-- ---------- LISTINGS (= Item; attributes vary by vertical) ----------
create table listings (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id),
  vertical_id uuid references verticals(id),
  title text not null,
  attributes jsonb default '{}'::jsonb,    -- RE: address/beds/price; matcha: sku/price
  status text default 'active',
  created_at timestamptz default now()
);

create table property_authorizations (
  id uuid primary key default uuid_generate_v4(),
  listing_id uuid references listings(id) on delete cascade,
  user_id uuid references users(id),
  status text default 'pending',
  source text,                             -- MLS | IDX | builder | manual
  created_at timestamptz default now()
);

-- ---------- LIVE STREAMS ----------
create table shows (
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

create table show_listings (
  show_id uuid references shows(id) on delete cascade,
  listing_id uuid references listings(id) on delete cascade,
  primary key (show_id, listing_id)
);

create table streams (
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

create table stream_destinations (        -- social multicast targets
  id uuid primary key default uuid_generate_v4(),
  stream_id uuid references streams(id) on delete cascade,
  platform text,                           -- youtube | tiktok | instagram | facebook
  public_url text,
  status text default 'pending'
);

create table chat_messages (              -- live chat (also cached in Redis)
  id uuid primary key default uuid_generate_v4(),
  stream_id uuid references streams(id) on delete cascade,
  user_id uuid references users(id),
  display_name text,
  body text,
  created_at timestamptz default now()
);

-- ---------- ENGAGEMENT → LEADS → APPOINTMENTS ----------
create table engagements (
  id uuid primary key default uuid_generate_v4(),
  show_id uuid references shows(id) on delete cascade,
  viewer_id uuid references users(id),
  type text,                               -- watch | question | intent | showing_request
  created_at timestamptz default now()
);

create table leads (
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

create table appointments (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid references leads(id) on delete cascade,
  scheduled_at timestamptz,
  status text default 'requested'
);

-- ---------- E-COMMERCE (Matcha / Global Trade) ----------
create table orders (
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

create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id),
  plan text,
  stripe_subscription_id text,
  status text default 'active',
  created_at timestamptz default now()
);

-- ---------- TRANSACTIONS / REVENUE (commission via brokerage, not SaaS) ----------
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid references appointments(id),
  amount numeric(14,2),
  commission numeric(14,2),
  brokerage_id uuid references organizations(id),   -- commission routes here, NOT platform
  status text default 'open',
  created_at timestamptz default now()
);

create table revenue_events (
  id uuid primary key default uuid_generate_v4(),
  transaction_id uuid references transactions(id),
  type text,                               -- commission | referral | subscription | lead_fee | ad
  amount numeric(14,2),
  routed_to_brokerage boolean default false,
  referral_agreement_ref text,
  created_at timestamptz default now()
);

-- ---------- ESCROW EVENT LOGS (software NEVER holds funds) ----------
create table escrow_events (
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
create table housing_resources (
  id uuid primary key default uuid_generate_v4(),
  type text,                               -- workshop | guide | grant-program
  title text,
  body text,
  is_nonprofit boolean default true,
  created_at timestamptz default now()
);

create table attendees (                   -- workshop / event attendees (nonprofit)
  id uuid primary key default uuid_generate_v4(),
  resource_id uuid references housing_resources(id) on delete cascade,
  name text,
  email text,
  registered_at timestamptz default now()
);

create table donations (                   -- nonprofit only; never commingled
  id uuid primary key default uuid_generate_v4(),
  donor_name text,
  amount numeric(14,2),
  source text,                             -- grant | individual
  restricted boolean default false,
  created_at timestamptz default now()
);

-- ---------- AUDIT LOGS ----------
create table audit_logs (
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
create policy leads_tenant on leads for select using (
  org_id = current_org() or current_role_val() = 'platform_admin'
);
create policy leads_insert on leads for insert with check ( true );  -- public forms insert

-- listings: org members manage own; public can read active
create policy listings_read on listings for select using ( status='active' or org_id=current_org() );
create policy listings_write on listings for all using ( org_id=current_org() );

-- orders: buyer/org scoped
create policy orders_tenant on orders for select using ( org_id=current_org() or current_role_val()='platform_admin' );

-- escrow: brokerage + admin only, NEVER consumers
create policy escrow_read on escrow_events for select using (
  current_role_val() in ('listing_broker','platform_admin')
);

-- nonprofit isolation: commercial roles cannot read donations
create policy donations_isolated on donations for select using (
  current_role_val() = 'platform_admin'
);
create policy housing_public on housing_resources for select using ( is_nonprofit = true );

-- MLS sync support: add listing_id + unique constraint for upsert onConflict
alter table listings add column if not exists listing_id text;
create unique index if not exists listings_listing_id_uidx on listings(listing_id);
