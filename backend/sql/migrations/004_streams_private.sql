-- ============================================================
-- 004 — Keep stream host details private.
-- streams.meta holds agent email/phone, the Cloudflare live-input id and a hash of the
-- private Go-Live link. The Bridges server reads streams with the service key, so the public
-- (anon) read policy isn't needed. Idempotent.
-- ============================================================
drop policy if exists streams_public_read on streams;
alter table streams enable row level security;
