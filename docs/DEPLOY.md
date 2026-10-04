# Deploy Bridges Live (free tiers)

The Node server serves **every existing page** plus the API and WebSockets, so production is one
service. Cloudflare Pages alone can't run WebSockets or hold the Supabase/PayPal secrets.

## 1. Supabase (once)
Supabase → SQL Editor → paste `backend/sql/supabase_setup.sql` → Run.
Locally, `npm run db:check` should print `✓ Supabase`.

## 2. Render (free web service)
1. render.com → sign in with GitHub → **New → Blueprint** → choose `BridgesHQ/Bridges-live`
   (branch with `render.yaml`).
2. When asked, paste: `SUPABASE_SERVICE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`
   (`PAYPAL_WEBHOOK_ID` can stay empty). `ADMIN_TOKEN` is generated for you — copy it from
   the service's Environment tab; it is your `/admin` password.
3. Deploy. Open `https://bridges-live.onrender.com/api/health` → `{"ok":true,"database":"supabase",…}`.

Free-tier note: the service sleeps after ~15 min without visitors and takes ~30–60 s to wake.
Render's $7/mo Starter plan keeps it always on — only worth it once you're streaming regularly.

## 3. Point the domain
Cloudflare → DNS for `bridgesglobal.co` → change the `live` record to
`CNAME live → bridges-live.onrender.com` (proxy **DNS only** / grey cloud while Render issues the
certificate) → in Render → Settings → Custom Domains → add `live.bridgesglobal.co`.
Keep the Cloudflare Pages project as a backup; the pages still work there in static mode.

## 4. PayPal webhook (optional backup confirmation)
developer.paypal.com → your sandbox app → Webhooks → add
`https://live.bridgesglobal.co/api/paypal/webhook` with `PAYMENT.CAPTURE.COMPLETED`,
`PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.AUTHORIZATION.VOIDED` → put the webhook ID in `PAYPAL_WEBHOOK_ID`.

## 5. Going live with real money (later)
- Switch `PAYPAL_ENV=live` + live app credentials.
- Property holds stay **off** in live mode until the broker/attorney confirms the $500
  authorization isn't earnest money → then `HOLDS_LEGAL_SIGNOFF=true`.

Production defaults in `render.yaml`: `DEMO_MODE=false` (real viewer counts),
`AUTO_APPROVE_STREAMS=false` (you approve new hosts in /admin), `REQUIRE_SUPABASE=true`,
and the PayPal simulator is refused when `NODE_ENV=production`.
