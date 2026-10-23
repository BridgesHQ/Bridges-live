-- 007 — security lock-down. Paste into Supabase → SQL Editor → Run. Safe to run more than once.
--
-- 1) Row Level Security on EVERY table in the public schema. The website's server uses the service
--    key, which bypasses RLS, so nothing on the site changes. The public (anon) key that lives in the
--    web pages can then only do what a policy allows: insert a lead. It can read nothing private.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- leads: the public can insert (website forms) but never read, update or delete
drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads for insert to anon, authenticated with check (true);
revoke select, update, delete on table public.leads from anon;

-- private tables: no anon access at all, even if a policy is added by mistake later
do $$
declare t text;
begin
  foreach t in array array['appointments','engagements','lead_events','lead_followups','audit_logs','transactions',
                           'revenue_events','subscriptions','licenses','property_authorizations','attendees','users',
                           'orders','settings','stream_destinations','social_videos'] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $$;

-- 2) Check: every public table should now show rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;

-- 3) Accounts. The website's /admin does NOT use these accounts (it is protected only by ADMIN_TOKEN),
--    but other apps on this Supabase project (e.g. the CRM) do. Review, then remove everyone but you:
select id, email, created_at, last_sign_in_at from auth.users order by created_at;
select id, email, full_name, role from public.users order by email;
-- When the list above looks right, remove the -- from the next two lines and run them:
-- delete from auth.users   where lower(email) <> 'dd@bridgesglobal.co';
-- delete from public.users where lower(email) <> 'dd@bridgesglobal.co';
