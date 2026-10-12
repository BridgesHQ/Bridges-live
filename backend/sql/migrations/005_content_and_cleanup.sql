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
