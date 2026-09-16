# Handoff to Claude Code (the build phase)
This chat produced the PROTOTYPE + SPECS + STARTER CODE. The actual running
platform is built in Claude Code, which has repo access and can run/test/connect.

## Why Claude Code (not this chat)
- This chat = static files + specs. Cannot run a server, DB, WebSocket, or
  connect Stripe/YouTube/Cloudflare/Supabase live.
- Claude Code = works inside your GitHub repo. Can build, run, test, and wire
  every service. This is required for the streaming + checkout engine.

## What to hand Claude Code (all in this ZIP)
- /backend  → schema.sql, app/page.tsx, api/streams.js, api/payments.js,
              api/sync/stellar-mls-route.ts, webhooks/escrow.js, README.md
- /docs     → ARCHITECTURE, VERTICAL model, SECURITY, COMPLIANCE, TECHNICAL_SPEC,
              POC_MATCHA_FIRST_SPEC, BRIDGES_COMMAND_CENTER, PROJECT_STATUS, TASK_LEDGER
- The static site (this deploy) = the UI reference to match.

## First build target (in order)
1. Create GitHub repo; push the Next.js app (use app/page.tsx as homepage).
2. Run schema.sql in Supabase; seed verticals (matcha, real-estate, etc.).
3. Build the MATCHA PoC: single-phone stream embed + Stripe HOSTED checkout +
   WebSocket "just bought" ticker. Validate watch→click→buy.
4. Add Bridges Command Center (comment_events ingest + moderation + routing).
5. Only after PoC works: graduate the engine to property "Reserve" +
   Earnnest/escrow compliance. Keep auctions/multi-cam as future phases.

## Keys YOU provide to Claude Code (env vars, never in client)
SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
CF_STREAM_TOKEN (or IVS), BRIDGE_API_SERVER_TOKEN (Stellar MLS), APP_URL.
