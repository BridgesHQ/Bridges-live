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
