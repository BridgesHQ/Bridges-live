# Bridges Global — Backend (developer starter)
Real code for your developer to wire. Nothing here runs until env keys are set.

## Files
- sql/schema.sql          — full Supabase Postgres schema + RLS. Run in Supabase SQL editor.
- api/streams.js          — stream room creation + WebSocket (chat, viewer count, showing requests)
- api/payments.js         — Stripe Connect: SaaS subscriptions + Matcha/e-commerce checkout + webhook
- webhooks/escrow.js      — Earnnest/Payload escrow webhooks + FL 3-business-day tracking + reconciliation

## Env vars needed (set in Vercel/host — NEVER in client)
SUPABASE_URL, SUPABASE_SERVICE_KEY
CF_ACCOUNT, CF_STREAM_TOKEN, CF_SUBDOMAIN     (Cloudflare Stream)  — or IVS/LiveKit equivalents
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
EARNNEST_SECRET, PAYLOAD_SECRET
APP_URL

## Order to implement (free-tier first)
1. Run sql/schema.sql in Supabase. Seed verticals: real-estate, matcha, global-trade, nonprofit-housing.
2. Deploy Next.js app (Vercel/Cloudflare). Wire Supabase Auth (magic links + MFA).
3. Mount api/streams.js + attachWs(server) for live rooms. Start FREE with Cloudflare Stream.
4. Add api/payments.js for Matcha orders + SaaS subs (Stripe).
5. Add webhooks/escrow.js LAST, only for real-estate deals (Earnnest/Payload).

## Compliance (attorney sign-off required)
- Software never holds earnest money. Escrow webhooks only RECORD + route to title/broker trust.
- Real-estate commission routes through brokerage, not the SaaS platform.
- Nonprofit (501c3) data + funds isolated via vertical_id + RLS.

## MLS SYNC (real Stellar MLS listings)
- api/sync/stellar-mls-route.ts → place at app/api/sync/stellar-mls/route.ts
- Uses Bridge Interactive RESO Web API (Stellar dataset) → upserts into `listings`.
- Env: BRIDGE_API_SERVER_TOKEN, RE_VERTICAL_ID, RE_ORG_ID, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
- Prereqs: (1) sign a Bridge Interactive / Stellar MLS data agreement + get server token;
  (2) seed a 'real-estate' vertical row + brokerage org row, put their IDs in env.
- Schedule via Vercel Cron every 15 min: GET /api/sync/stellar-mls?pages=5
- Rich MLS fields stored in listings.attributes (JSONB): price, beds, baths, sqft,
  photos, showing_instructions, lat/lng, mls_status, source='stellar-mls'.

## HOMEPAGE COMPONENT (Whatnot/Twitch-style live hub)
- app/page.tsx → the Next.js homepage: big live player (65%) + chat/pinned-property drawer (35%),
  featured live grid below, multi-vertical nav (incl. Bridges Matcha + Housing Education 501c3),
  "Enter Bridges Live" CTA, compliance footer with LPT Realty disclosure.
- Responsive: on mobile the player stacks full-width, chat below.
- Env: NEXT_PUBLIC_WS_URL (WebSocket base, points at api/streams.js attachWs).
- Player slot: mount Cloudflare Stream/WebRTC playbackUrl (from api/streams.js init).
- Dark luxury theme (navy #0E1E52 / gold #D8BC6A) — Whatnot layout, Sotheby's restraint.
