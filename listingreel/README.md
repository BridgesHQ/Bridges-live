# ListingReel

Turns licensed real-estate listing photos into compliant short-form videos: 10 AI-written
scripts per listing (Fair Housing guardrails), approve/edit, render vertical MP4s with
Creatomate, $149/mo Stripe subscription with a 7-day trial, CTA click tracking.

Lives in the Bridges-live repo and shares the **same Supabase project** as Bridges Live.
Its tables are prefixed `lr_` so they never collide with Bridges' `users` / `listings` /
`subscriptions`. Every ListingReel sign-up is also added to the Bridges `leads` table, and the
Bridges `/admin` has a **🎬 ListingReel** tab (agents, listings, videos, clicks).

## 1. Database (once)
Supabase → SQL Editor → New query → paste **all of** `supabase/migrations/001_init.sql` → Run.
Safe to re-run.

Supabase → Authentication:
- **Providers → Email**: enabled (magic links). **Google**: optional (needs a Google OAuth client).
- **URL Configuration**: Site URL = your Vercel URL; add `https://<your-app>.vercel.app/auth/callback`
  (and `http://localhost:3000/auth/callback` for local) to **Redirect URLs**.

## 2. Deploy on Vercel (free Hobby plan)
1. vercel.com → sign in with GitHub → **Add New → Project** → import `BridgesHQ/Bridges-live`.
2. **Root Directory → `listingreel`** (important — the repo root is Bridges Live). Framework: Next.js.
3. Environment variables — see `.env.example`. Minimum to sign in and create listings:
   `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
   Add `ANTHROPIC_API_KEY` for scripts, `CREATOMATE_*` for videos, `STRIPE_*` for billing.
   With no Stripe keys, every signed-in user can use the app free (good for testing).
4. Deploy → copy the URL → set `NEXT_PUBLIC_APP_URL` to it → Redeploy.

## 3. Local
```bash
cp .env.example .env.local   # fill in
npm install && npm run dev   # http://localhost:3000
npm test && npm run typecheck && npx next build
```

## What was fixed from the uploaded MVP
- **Build**: Stripe `apiVersion` didn't match the installed SDK (build failed); env vars were
  parsed at import so builds and every page crashed unless *all* keys (Stripe, Creatomate…) existed —
  now validated per feature, on first use.
- **Sign-in never worked**: the login page stored the session in localStorage, which the server
  can't see, so `/dashboard` looped back to `/login`. Now uses cookie sessions (`@supabase/ssr`)
  plus an `/auth/callback` route; `next` redirects are same-origin only.
- **Buttons crashed**: "Generate scripts" read the request body twice; "Render" only accepted JSON
  but was posted from an HTML form. Both accept forms and redirect back with a message.
- **Rendering was impossible**: there was no way to approve a script. Added approve/edit cards
  (edits re-checked for Fair Housing compliance) and a "Check video progress" button.
- **Stripe webhook never saved anything** (upserted without the required `user_id`); checkout
  didn't link the customer to the user, and the trial could be repeated. Fixed; paid features
  (AI, renders) require an active/trialing subscription once Stripe is configured.
- **Fair Housing filter false positives**: no word boundaries, so "terrace", "Grace Ave",
  "Islamorada" were blocked. Whole-word matching, expanded steering list, unit tests.
- **AI**: current model (`claude-opus-5-5`), schema-validated JSON output, server-side fallback if a
  request is declined, scene photo indexes validated.
- **Security / RLS**: table names prefixed `lr_`; browser access is read-only to the user's own rows;
  OAuth tokens (`lr_connected_accounts`) and click events have no browser access at all; users can't
  change their email row; CTA links must be http(s) (DB check + server) — no `javascript:` or open
  redirects; uploads get server-chosen file names; tracking IDs validated; cron secret compared in
  constant time.
- **Vercel Hobby** only allows daily crons — the hourly cron would have blocked deployment.

## Still to build (needs platform approvals)
Posting to TikTok / Instagram / YouTube / Facebook: each needs its own developer app, OAuth
redirect, and app review. The publisher interface (`lib/platforms`) is ready; until then the app
offers the MP4 download. When added, encrypt tokens at rest before storing them in
`lr_connected_accounts`.
