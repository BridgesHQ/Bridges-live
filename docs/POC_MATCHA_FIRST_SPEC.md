# Bridges Live — Production Spec (Matcha-First Proof of Concept)
Validate the streaming + instant-checkout engine on a $30 product (matcha)
BEFORE risking it on property reservations. Same engine, safe testing ground.

═══════════════════════════════════════════════════════════════════
1. EXECUTIVE SUMMARY & SIMPLIFIED MODEL
═══════════════════════════════════════════════════════════════════
Blend: high-engagement live selling (Kuaishou/Whatnot) + high-trust
transaction UI (Sotheby's) — but STRIPPED to the minimum viable loop:
  Single-phone live stream → viewer clicks → instant Stripe checkout → confirm.

DECISIONS LOCKED (per this brief):
- Multi-camera: ELIMINATED. Default = ONE smartphone camera.
- Home-finishing upgrades: OPTIONAL add-ons only (not core, not required).
- Theme: TRUST (light) default + LUXURY (dark/gold) optional toggle.
- Proof of concept: MATCHA first. Property deposits come AFTER the engine works.

WHY MATCHA FIRST (validated by research):
- Live commerce converts up to 10x standard e-commerce (Stripe, 2026).
- Matcha = simple physical good: no license, no escrow, instant Stripe checkout.
- Property deposits carry FREC/escrow/legal risk — prove plumbing on matcha first.
- Same code: swap the "product" for a "unit reservation" once trusted.

═══════════════════════════════════════════════════════════════════
2. UI/UX & COLOR (Trust default + Luxury toggle)
═══════════════════════════════════════════════════════════════════
DESIGN TOKENS (one variable swaps the whole theme — Linear/Vercel pattern):

TRUST THEME (default — builders/renters/matcha volume):
  --bg:#FAFAFA  --surface:#FFFFFF  --text:#1A1A1A  --muted:#5A6270
  --brand:#0E1E52 (navy)  --accent:#C9A84C (soft gold, ACCENT ONLY)
  --cta:#1A5C3A (green, high-contrast action)  --live:#D2352A

LUXURY THEME (optional toggle — penthouse/auction):
  --bg:#0B0C10 (obsidian)  --surface:#131720  --text:#F1F1EC
  --brand:#0E1E52  --accent:#CBB26A (refined gold — softer than #D4AF37)
  --cta:#1A5C3A  --live:#D2352A
RULE (research): "a little gold goes a long way" — gold = accents/prices only,
never large fills. Navy is the connective tissue between both themes.

STREAM LAYOUT (single-cam, simple):
  - Big player (65%) — single phone feed, LIVE badge, viewer count,
    lower-third: product/price + dynamic CTA.
  - Right drawer (35%) — live chat + "Pinned Item" card + action bar.
  - Below — filterable grid of other live streams.
NO multi-cam switcher. NO drone/floor-plan tabs (property phase may add later).

═══════════════════════════════════════════════════════════════════
3. CORE ENGINE — STREAMING + INSTANT CHECKOUT
═══════════════════════════════════════════════════════════════════
STREAMING (single phone, cheapest path):
  Phase 1: phone → YouTube/TikTok Live → embed on bridges-live (FREE, today).
  Phase 2: phone → Cloudflare Stream / Amazon IVS → native player (<1s latency).

INSTANT CHECKOUT (the thing we're proving):
  Stripe HOSTED Checkout (research: fastest, cheapest, PCI-handled).
  Flow: viewer taps "Buy now" → POST /api/checkout → Stripe Session →
  redirect to Stripe-hosted page → pay → webhook confirms → chat shows
  "🍵 Maria just bought!" (social proof) → order in DB.
  UPGRADE LATER: change ui_mode 'hosted' → 'embedded' for in-stream checkout
  (same checkout.sessions.create() call — NOT a rebuild).

OPTIONAL ADD-ONS (matcha): whisk, bowl, gift tin — checkboxes in the checkout,
proving the "upgrade/add-on" pattern that later becomes home-finishing upgrades.

═══════════════════════════════════════════════════════════════════
4. TECH STACK (minimal for PoC)
═══════════════════════════════════════════════════════════════════
Frontend:  Next.js + Tailwind (existing prototype = UI reference).
Realtime:  WebSocket (chat, viewer count, "just bought" events) — Socket.io/Redis.
Backend:   Node/TS API routes (already coded: api/streams.js, api/payments.js).
Database:  Supabase Postgres (orders table already in schema.sql).
Payments:  Stripe Hosted Checkout (one-time). Add Alipay/WeChat/cards.
Video:     YouTube embed (P1) → Cloudflare Stream/IVS (P2).
DEFERRED (property phase, NOT now): Plaid, Escrow.com, Kafka, auctions,
  proof-of-funds, GraphQL. Keep as future spec — do not build for matcha PoC.

═══════════════════════════════════════════════════════════════════
5. DATA FLOW + JSON (Buy Now)
═══════════════════════════════════════════════════════════════════
1. Viewer taps "Buy now" in stream.
2. Client → POST /api/checkout {productId, addons[], streamId}.
3. Server creates Stripe Checkout Session (hosted) → returns url.
4. Redirect to Stripe → buyer pays (PCI on Stripe).
5. Stripe webhook → mark order 'paid' in Supabase.
6. WebSocket broadcast → chat shows "just bought" social proof.
7. (Later property phase: step 3 becomes a $500 refundable hold via Stripe
   PaymentIntent capture=manual; escrow ONLY for real earnest money.)

// WebSocket event — item purchased (broadcast to room)
{
  "type": "item_purchased",
  "streamId": "str_123",
  "product": "Ceremonial Matcha 30g",
  "buyerFirst": "Maria",
  "addons": ["bamboo whisk"],
  "amount": 32.00,
  "currency": "usd",
  "ts": "2026-09-09T20:00:00Z"
}

// API — live stream product metadata
GET /api/streams/str_123/product
{
  "streamId": "str_123",
  "title": "Bridges Matcha — Live Ceremonial Tasting",
  "product": {
    "id": "prod_matcha_30",
    "name": "Ceremonial Matcha 30g (Uji, Kyoto)",
    "price": 30.00, "currency": "usd",
    "addons": [
      {"id":"whisk","name":"Bamboo whisk","price":18.00},
      {"id":"bowl","name":"Chawan bowl","price":24.00}
    ]
  },
  "cta": {"label":"Buy now","action":"checkout"},
  "viewers": 210, "live": true
}

═══════════════════════════════════════════════════════════════════
6. VALIDATION PATH (prove, then graduate)
═══════════════════════════════════════════════════════════════════
STEP 1 (matcha PoC): stream a tasting → viewers buy matcha via Stripe hosted →
  measure: watch→click→buy conversion, chat social proof, checkout success.
STEP 2 (harden): swap ui_mode to embedded (in-stream checkout), add Cloudflare
  Stream native player, add "just bought" WebSocket ticker.
STEP 3 (graduate to property): reuse the SAME engine — replace product with a
  UNIT; "Buy now" becomes "Reserve ($500 refundable hold)" via Stripe manual-
  capture PaymentIntent; add FREC compliance + Earnnest for REAL earnest money.
STEP 4 (optional, later): luxury auction engine, proof-of-funds, multi-cam —
  ONLY after the reservation loop earns. Keep as future spec.

BUILD TOOL: this is real running software (WebSocket, Stripe, DB) — use
Claude Code in the GitHub repo (not static files) to build + test it.

═══════════════════════════════════════════════════════════════════
7. COMPLIANCE BOUNDARY (Stripe hosted OK for matcha, NOT for RE deposits)
═══════════════════════════════════════════════════════════════════
- MATCHA (this PoC): Stripe Hosted Checkout = fine. Simple physical good,
  no license, no escrow. Money is a normal e-commerce sale.
- REAL ESTATE (later): a "$500 refundable hold" MAY run as a Stripe manual-
  capture PaymentIntent IF broker/attorney confirms it is a service/interest
  hold and NOT statutory earnest money. TRUE earnest money must route via
  Earnnest/Payload → broker trust / title escrow (FREC 3-day rule) — NEVER Stripe.
- This PoC does NOT override or change any real-estate/escrow logic. It is an
  isolated e-commerce test of the streaming+checkout ENGINE only.
- No real-estate copy changes: property flows keep "Request a Showing" (no
  reserve/deposit) until the deposit workflow is legally defined.
