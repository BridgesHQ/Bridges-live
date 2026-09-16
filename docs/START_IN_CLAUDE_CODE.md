# Bridges Live — Start in Claude Code (save + connect backend, low/free cost)

## STEP 0 — Save this project to GitHub (free)
1. Create a free GitHub account + a new PRIVATE repo named `bridges-live`.
2. On your computer: unzip the ZIP Claude gave you.
3. In a terminal in that folder:
     git init
     git add .
     git commit -m "Bridges Live — front-end + backend code + specs"
     git branch -M main
     git remote add origin https://github.com/<you>/bridges-live.git
     git push -u origin main

## STEP 1 — Install Claude Code (free to install)
   npm install -g @anthropic-ai/claude-code
   (needs Node.js 18+. Then run `claude` inside the repo folder.)

## STEP 2 — First message to Claude Code (paste this)
"Read /docs/CLAUDE_CODE_HANDOFF.md and /docs/POC_MATCHA_FIRST_SPEC.md.
Build the MATCHA proof-of-concept FIRST: wire the Action-Drawer 'Matcha Pilot'
Buy-now button to Stripe Hosted Checkout, connect Supabase using schema.sql,
and add the WebSocket 'just bought' event from api/streams.js. Keep all existing
front-end and content. Do not build auctions or multi-cam. Use free tiers."

## STEP 3 — Keys to paste when Claude Code asks (env vars)
- SUPABASE_URL + SUPABASE_SERVICE_KEY   (app.supabase.com → free tier)
- STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET  (stripe.com → test mode is FREE)
- (later) CF_STREAM_TOKEN, BRIDGE_API_SERVER_TOKEN

## LOW / FREE COST STACK (nothing auto-charges)
- GitHub: free (private repos free)
- Claude Code: install free (usage billed to your Anthropic account per use)
- Vercel or Cloudflare Pages hosting: free tier
- Supabase (Postgres + Auth): free tier
- Stripe: free to set up; TEST MODE costs $0; live mode = per-transaction fee only
- YouTube Live: free (streaming/video engine for now)
=> You can build + test the entire Matcha PoC for ~$0 (Stripe test mode).

## BUILD ORDER (don't skip)
1. Matcha PoC (Stripe hosted checkout + WebSocket) — prove the loop, $0.
2. Bridges Command Center (comment_events ingest + moderation + routing).
3. Graduate engine to property "Reserve $500 hold" + Earnnest/escrow compliance.
4. Later: Cloudflare Stream/IVS native video, Stellar MLS sync, auctions (Phase 3+).

## WHAT'S IN THIS REPO (reference)
- /  (front-end: index.html + all pages — the deployable prototype)
- /backend/app       page.tsx + components (theme, player, chat, grid, toggles)
- /backend/api       streams.js (WebSocket), payments.js (Stripe), sync/stellar-mls
- /backend/webhooks  escrow.js (Earnnest/Payload, FL 3-day tracking)
- /backend/sql       schema.sql (full Supabase schema + RLS)
- /docs              all specs: ARCHITECTURE, TECHNICAL_SPEC, POC_MATCHA_FIRST,
                     BRIDGES_COMMAND_CENTER, SECURITY, COMPLIANCE, VERTICAL model,
                     PROJECT_STATUS, TASK_LEDGER, ROADMAP, this file

## PAYMENT CHOICE: PayPal (not Stripe) for matcha PoC
- Dorota chose PayPal for the matcha proof-of-concept checkout.
- Claude Code: wire PayPal Checkout (Smart Buttons / Orders API) to the
  "Matcha Pilot → Buy now" button instead of Stripe. Use PayPal Sandbox (free)
  to test with no real charges. Keep Stripe code available for later subscriptions.
- Env: PAYPAL_CLIENT_ID, PAYPAL_SECRET (sandbox first).
