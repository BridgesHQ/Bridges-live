-- ============================================================
-- ListingReel schema — runs in the SAME Supabase project as Bridges Live.
-- All tables are prefixed lr_ because Bridges Live already owns
-- public.users / public.listings / public.subscriptions.
-- Idempotent: safe to run more than once.
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.lr_users(
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null, full_name text, created_at timestamptz default now());

create table if not exists public.lr_listings(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.lr_users(id) on delete cascade,
  address text not null, price numeric not null check (price > 0), beds int not null, baths numeric not null, sqft int not null,
  highlights text[] not null, agent_name text not null, brokerage_name text not null,
  cta_link text not null check (cta_link ~* '^https?://'),
  photos text[] not null, photo_paths text[] not null default '{}',
  license_ack boolean not null default false,
  status text not null default 'draft' check (status in ('draft','generating','scripts_ready','rendering','ready','failed')),
  created_at timestamptz default now());

create table if not exists public.lr_scripts(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.lr_listings(id) on delete cascade,
  idx int not null, title text not null, hook text not null, scenes jsonb not null, cta text not null, caption text not null,
  approved boolean not null default false, created_at timestamptz default now(), unique(listing_id, idx));

create table if not exists public.lr_videos(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.lr_listings(id) on delete cascade,
  script_id uuid references public.lr_scripts(id) on delete set null,
  render_job_id text, render_status text not null default 'queued', mp4_url text,
  platform_posts jsonb not null default '[]', analytics jsonb not null default '{}',
  scheduled_for date, created_at timestamptz default now());

create table if not exists public.lr_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.lr_users(id) on delete cascade,
  stripe_customer_id text unique, stripe_subscription_id text unique, status text,
  trial_end timestamptz, current_period_end timestamptz, created_at timestamptz default now());

-- OAuth tokens for social posting: server-only (service role). No client policy at all.
create table if not exists public.lr_connected_accounts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.lr_users(id) on delete cascade,
  platform text not null check (platform in ('tiktok','instagram','youtube','facebook')),
  access_token text not null, refresh_token text, expires_at timestamptz,
  account_id text, account_name text, scopes text[],
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(user_id, platform));

create table if not exists public.lr_click_events(
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.lr_videos(id) on delete cascade,
  created_at timestamptz default now(), user_agent text, referrer text);

create index if not exists lr_listings_user_idx on public.lr_listings(user_id);
create index if not exists lr_videos_status_idx on public.lr_videos(render_status);
create index if not exists lr_clicks_video_idx on public.lr_click_events(video_id);

insert into storage.buckets(id, name, public) values ('listing-photos','listing-photos', false) on conflict do nothing;
insert into storage.buckets(id, name, public) values ('rendered-videos','rendered-videos', false) on conflict do nothing;

-- ---------- Row-level security (tightened) ----------
-- Browser (anon/authenticated) access is read-mostly; every write that matters goes through
-- server routes using the service role, which also enforce ownership.
alter table public.lr_users enable row level security;
alter table public.lr_listings enable row level security;
alter table public.lr_scripts enable row level security;
alter table public.lr_videos enable row level security;
alter table public.lr_subscriptions enable row level security;
alter table public.lr_connected_accounts enable row level security;
alter table public.lr_click_events enable row level security;

drop policy if exists lr_users_read on public.lr_users;
create policy lr_users_read on public.lr_users for select to authenticated using (id = auth.uid());
drop policy if exists lr_users_update on public.lr_users;
create policy lr_users_update on public.lr_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists lr_listings_read on public.lr_listings;
create policy lr_listings_read on public.lr_listings for select to authenticated using (user_id = auth.uid());
drop policy if exists lr_listings_delete on public.lr_listings;
create policy lr_listings_delete on public.lr_listings for delete to authenticated using (user_id = auth.uid());

drop policy if exists lr_scripts_read on public.lr_scripts;
create policy lr_scripts_read on public.lr_scripts for select to authenticated
  using (exists (select 1 from public.lr_listings l where l.id = listing_id and l.user_id = auth.uid()));

drop policy if exists lr_videos_read on public.lr_videos;
create policy lr_videos_read on public.lr_videos for select to authenticated
  using (exists (select 1 from public.lr_listings l where l.id = listing_id and l.user_id = auth.uid()));

drop policy if exists lr_subs_read on public.lr_subscriptions;
create policy lr_subs_read on public.lr_subscriptions for select to authenticated using (user_id = auth.uid());
-- lr_connected_accounts, lr_click_events: no policies → no browser access (service role only).

-- column-level: users may only change their display name
revoke update on public.lr_users from anon, authenticated;
grant update (full_name) on public.lr_users to authenticated;

-- Storage: per-user folders; reads via short-lived signed URLs created by the server.
drop policy if exists lr_photo_read on storage.objects;
create policy lr_photo_read on storage.objects for select to authenticated using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists lr_photo_delete on storage.objects;
create policy lr_photo_delete on storage.objects for delete to authenticated using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- New sign-up → ListingReel profile + Bridges Live lead ----------
-- Every ListingReel sign-up also lands in the Bridges Live `leads` table, so it shows up
-- in the Bridges admin. A failed lead insert never blocks the sign-up.
create or replace function public.lr_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.lr_users(id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name') on conflict (id) do nothing;
  begin
    if to_regclass('public.leads') is not null then
      insert into public.leads(first_name, email, market, stage, priority, source, notes)
      values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email,
              'ListingReel', 'New', 'High', 'ListingReel — agent sign-up', 'Signed up for ListingReel (AI listing videos).');
    end if;
  exception when others then null;
  end;
  return new;
end; $$;
revoke execute on function public.lr_handle_new_user() from public, anon, authenticated;

drop trigger if exists lr_on_auth_user_created on auth.users;
create trigger lr_on_auth_user_created after insert on auth.users
  for each row execute procedure public.lr_handle_new_user();
