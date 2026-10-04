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
