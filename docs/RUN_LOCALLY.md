# Run Bridges Live locally

The existing site (every page, unchanged design) is served by a small Node server that
adds the live-commerce engine:

- **Multi-streamer grid + live player** — `/live-marketplace` (YouTube Live, HLS from
  Cloudflare Stream / Amazon IVS, or MP4). Deep link: `/live-marketplace?stream=<id>`.
- **WebSocket realtime** (`/ws`) — per-stream chat, live viewer counts, a lobby feed for the
  grid, and "🍵 Maria just bought…" / "🔑 Kai just reserved a hold…" / "🏠 … requested a showing" events.
- **One checkout engine, two verticals (PayPal)**
  - Matcha **Buy now** → PayPal order with intent `CAPTURE` (add-ons: whisk, bowl, gift tin).
    Prices come from the server catalog, never from the browser.
  - Property **Request a showing** → lead + engagement + appointment.
  - Property **Reserve hold ($500)** → the same PayPal engine with intent `AUTHORIZE`: funds are
    held, never captured automatically; admin can void (release) the hold.
- **Go Live** — `/become-a-streamer` registers a host + stream (YouTube Live or `.m3u8` URL).
- **Admin** — `/admin` (log in with `ADMIN_TOKEN`): real leads, matcha orders, reserve holds
  (void button), live streams, and the **Command Center** (every chat comment auto-classified by
  intent: buy / reserve / showing / price / question; spam & abuse held for review).

## 1. Start (no keys needed)

```bash
npm install
cp .env.example .env      # optional — works without it
npm run dev               # → http://localhost:3000
```

With no keys the server uses `data/local-db.json` and a **PayPal sandbox simulator**, so the whole
loop (watch → chat → Buy now → "just bought" in every viewer's chat → order in admin) works offline.
Open two browser windows on the same stream to see realtime chat and purchase events.

Try: `/` (hub → *Matcha Pilot* → *Buy now*), `/live-marketplace`, `/matcha`, `/live-show`,
`/become-a-streamer`, `/admin`.

## 2. Connect Supabase

1. Create the tables (idempotent; safe on the existing project, including its older `leads` table):
   - **Easiest:** Supabase dashboard → SQL editor → paste `backend/sql/supabase_setup.sql` → Run.
   - **Or** set `DATABASE_URL` in `.env` and run `npm run db:migrate`.

   Order: `schema.sql` → `migrations/002_live_commerce.sql` → `seed.sql` (verticals: real-estate,
   matcha, global-trade, nonprofit-housing + the demo live streams).
2. Put `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (service_role key) in `.env` and restart.
   The startup banner shows `database: supabase`.

The public lead forms on every page post straight to Supabase with the publishable key; the
migration makes sure the `leads` table has all their columns and an anon **insert** policy.

## 3. Connect PayPal sandbox

1. developer.paypal.com → Apps & Credentials → **Sandbox** → create app → copy Client ID + Secret.
2. `.env`: `PAYPAL_CLIENT_ID=…`, `PAYPAL_SECRET=…`, `PAYPAL_ENV=sandbox`. Restart — the banner shows
   `paypal: sandbox` and the real PayPal buttons replace the simulator.
3. Pay with a sandbox **personal** test account (Sandbox → Accounts).
4. Optional: add a webhook (`<APP_URL>/api/paypal/webhook`, events `PAYMENT.CAPTURE.*`,
   `PAYMENT.AUTHORIZATION.VOIDED`) and set `PAYPAL_WEBHOOK_ID`.

## Tests

```bash
npm test     # boots the server and drives REST + WebSocket end-to-end (mock PayPal, temp DB)
```

## Compliance notes (unchanged rules from the specs)

- Matcha is a normal e-commerce sale.
- The property hold is an **authorization**, not a deposit or earnest money; it is never captured
  by the platform. In `PAYPAL_ENV=live` holds stay **off** until `HOLDS_LEGAL_SIGNOFF=true`
  (broker/attorney review). True earnest money continues to route via Earnnest/Payload → escrow.
- `DEMO_MODE=true` adds the seeded audience numbers to real connected viewers — set it to
  `false` in production so counts are real. No purchases or chat are ever faked.

## Deploying later (free tiers)

The static pages still work on Cloudflare Pages exactly as before (they fall back to their
original static behaviour when the API isn't reachable). The Node server needs a host that
supports WebSockets (Render / Railway / Fly free tiers). Set
`window.BRIDGES_API_BASE = "https://api.your-domain"` before `/assets/js/bridges-live.js` if the
API lives on a different origin than the pages, and list the pages' origin in `CORS_ORIGINS`.
