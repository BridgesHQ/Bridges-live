# Bridges Global — Production Technical Specification
Role: Principal Architect blueprint for the developer. This is a BUILD SPEC,
not deployed code. Nothing here activates paid infra without your approval.

═══════════════════════════════════════════════════════════════════
1. SYSTEM ARCHITECTURE & COMPONENT MAP
═══════════════════════════════════════════════════════════════════
CLIENT (Next.js App Router, TS, Tailwind) — SSR/SEO + app dashboards
   │  i18n routes: /en/... /pl/... /zh/... /ja/...  + hreflang
   ▼
EDGE / CDN (Cloudflare) — static, images, caching, WAF, rate limiting
   │
   ├─► API LAYER (Next.js API routes or Node/TS service)
   │       ├─ Auth (Supabase Auth / Auth0 / Clerk) + RBAC + MFA
   │       ├─ Postgres (Supabase or AWS RDS) via Prisma ORM
   │       ├─ Redis (live chat state, viewer counts, showing requests)
   │       └─ Queues/Workers (clips, transcripts, notifications)
   │
   ├─► VIDEO PIPELINE
   │       OBS / mobile → Amazon IVS (or Cloudflare Stream / LiveKit)
   │       → edge nodes (Asia/EU/NA) → Bridges Live player (HLS/WebRTC)
   │       → distribution connectors: YouTube / Meta / TikTok / Twitch
   │
   ├─► PAYMENTS
   │       Stripe Connect + Stripe Global (subs, SaaS, marketplace)
   │       intl methods: WeChat Pay, Alipay, SEPA, iDEAL, UnionPay, cards
   │       ⚠ EARNEST MONEY → Earnnest/Payload → FL bank/title escrow
   │           (NEVER through Stripe/SaaS processor — see §4)
   │
   ├─► CRM / AUTOMATION (HubSpot, Zapier/Make)
   ├─► ANALYTICS (PostHog/Mixpanel — events, attribution)
   └─► AI (Claude API — descriptions, lead-qual, moderation, clips)

MULTI-TENANT ISOLATION: every tenant-scoped row carries organization_id +
vertical_id; Postgres Row-Level Security enforces per-tenant/per-role access;
white-label via subdomain (agent.bridges…, brokerage.bridges…).

═══════════════════════════════════════════════════════════════════
2. DATABASE SCHEMA (Prisma)
═══════════════════════════════════════════════════════════════════
// Multi-tenant, vertical-agnostic. Real estate = first vertical.
model Vertical {
  id            String  @id @default(uuid())
  name          String  // "real-estate","ecommerce","global-trade"
  complianceRules Json?
  organizations Organization[]
}
model Organization {          // brokerage / merchant / tenant root
  id          String  @id @default(uuid())
  verticalId  String
  vertical    Vertical @relation(fields:[verticalId],references:[id])
  name        String
  subdomain   String? @unique
  plan        String  // "agent","brokerage","merchant","enterprise"
  users       User[]
  listings    Listing[]
  subscriptions Subscription[]
  createdAt   DateTime @default(now())
}
model User {
  id          String  @id @default(uuid())
  orgId       String
  org         Organization @relation(fields:[orgId],references:[id])
  email       String  @unique
  role        Role
  mfaEnabled  Boolean @default(false)
  licenses    License[]
  shows       Show[]
  createdAt   DateTime @default(now())
}
enum Role { CONSUMER SELLING_AGENT LISTING_BROKER EXTERNAL_MERCHANT PLATFORM_ADMIN }
model License {
  id        String @id @default(uuid())
  userId    String
  user      User @relation(fields:[userId],references:[id])
  type      String  // "FL-RE","TX-RE","dealer","seller-agreement"
  number    String
  state     String
  status    String  // verified/pending/expired
  expiresAt DateTime?
}
model Listing {                // = Item (vertical-agnostic)
  id          String  @id @default(uuid())
  orgId       String
  org         Organization @relation(fields:[orgId],references:[id])
  attributes  Json    // RE: address/beds/price ; e-com: sku/price/variants
  status      String
  authorizations PropertyAuth[]
  shows       ShowListing[]
}
model PropertyAuth {           // agent authorized to show a listing
  id        String @id @default(uuid())
  listingId String
  userId    String
  status    String
  source    String  // MLS/IDX/builder/manual
  createdAt DateTime @default(now())
  listing   Listing @relation(fields:[listingId],references:[id])
}
model Show {                   // business event
  id          String @id @default(uuid())
  hostId      String
  host        User @relation(fields:[hostId],references:[id])
  scheduledAt DateTime?
  category    String
  stream      Stream?
  listings    ShowListing[]
  engagements Engagement[]
}
model ShowListing { showId String; listingId String; @@id([showId,listingId])
  show Show @relation(fields:[showId],references:[id]); listing Listing @relation(fields:[listingId],references:[id]) }
model Stream {                 // technical session
  id          String @id @default(uuid())
  showId      String @unique
  show        Show @relation(fields:[showId],references:[id])
  provider    String  // "ivs","cloudflare","livekit"
  ingestUrl   String?
  playbackUrl String?
  status      String
  destinations StreamDestination[]
}
model StreamDestination {      // social distribution
  id        String @id @default(uuid())
  streamId  String
  platform  String  // youtube/facebook/instagram/tiktok/twitch
  status    String
  publicUrl String?
  stream    Stream @relation(fields:[streamId],references:[id])
}
model Engagement {             // viewer actions
  id        String @id @default(uuid())
  showId    String
  show      Show @relation(fields:[showId],references:[id])
  viewerId  String?
  type      String  // watch/question/intent
  createdAt DateTime @default(now())
  lead      Lead?
}
model Lead {
  id            String @id @default(uuid())
  engagementId  String? @unique
  engagement    Engagement? @relation(fields:[engagementId],references:[id])
  listingId     String?
  hostId        String
  name          String
  email         String
  phone         String?
  source        String
  stage         String @default("New")
  appointments  Appointment[]
  createdAt     DateTime @default(now())
}
model Appointment {
  id        String @id @default(uuid())
  leadId    String
  lead      Lead @relation(fields:[leadId],references:[id])
  scheduledAt DateTime
  status    String
  transaction Transaction?
}
model Transaction {
  id            String @id @default(uuid())
  appointmentId String? @unique
  appointment   Appointment? @relation(fields:[appointmentId],references:[id])
  amount        Decimal
  commission    Decimal?
  status        String
  escrowEvents  EscrowEvent[]
  revenue       RevenueEvent[]
}
model EscrowEvent {            // §4 compliance — NOT held by SaaS
  id            String @id @default(uuid())
  transactionId String
  transaction   Transaction @relation(fields:[transactionId],references:[id])
  processor     String  // "earnnest","payload"
  externalRef   String
  amount        Decimal
  state         String  // requested/collected/deposited/refunded
  agreementAt   DateTime          // execution timestamp
  depositDueBy  DateTime          // agreementAt + 3 business days (FL)
  depositedAt   DateTime?
  escrowAccount String  // FL bank / licensed title escrow
  createdAt     DateTime @default(now())
}
model RevenueEvent {
  id String @id @default(uuid())
  transactionId String
  amount Decimal
  type   String  // commission/referral/subscription/lead-fee/ad
  transaction Transaction @relation(fields:[transactionId],references:[id])
}
model Subscription {
  id String @id @default(uuid())
  orgId String
  org Organization @relation(fields:[orgId],references:[id])
  plan String
  stripeSubId String?
  status String
  payments Payment[]
}
model Payment { id String @id @default(uuid()); subscriptionId String; amount Decimal; currency String; method String; status String; subscription Subscription @relation(fields:[subscriptionId],references:[id]) }
model AuditLog {
  id String @id @default(uuid())
  orgId String?
  actorId String?
  action String
  entity String
  entityId String
  meta Json?
  createdAt DateTime @default(now())
}

═══════════════════════════════════════════════════════════════════
3. API SPECIFICATIONS (REST / OpenAPI-style)
═══════════════════════════════════════════════════════════════════
AUTH
  POST /api/auth/login            {email,password} → JWT (+MFA challenge for broker)
  POST /api/auth/mfa/verify       {code} → JWT
LIVE STREAM
  POST /api/shows                 create show (host,listings,scheduledAt)
  POST /api/streams/init          {showId,provider} → {ingestUrl,streamKey(server-only),playbackUrl}
  POST /api/streams/:id/destinations  {platform} → connect social (OAuth token server-side)
  WS   /ws/shows/:id              events: viewer_join, viewer_count, chat_message,
                                  intent_raised, showing_requested, stream_status
  POST /api/streams/:id/stop
LEADS
  POST /api/leads                 {engagementId,listingId,name,email,phone,source}
  GET  /api/leads (RBAC)          host sees own; broker sees org; RLS enforced
EARNEST MONEY WEBHOOKS (§4 — signature-verified)
  POST /api/webhooks/earnnest     verify sig → upsert EscrowEvent (state machine)
  POST /api/webhooks/payload      verify sig → upsert EscrowEvent
    States: requested → collected → deposited(escrowAccount) → [refunded]
    Enforce: depositDueBy = agreementAt + 3 FL business days; alert if breached.
    Funds NEVER touch Stripe/SaaS — processor routes buyer bank → FL/title escrow.
  GET  /api/escrow/reconciliation?month=  → ledger export (Rule 61J2-14.012 format)

═══════════════════════════════════════════════════════════════════
4. FL/TX ESCROW & FINANCIAL COMPLIANCE (hard rules)
═══════════════════════════════════════════════════════════════════
- SaaS/Stripe must NEVER hold or commingle earnest money. Full stop.
- Earnest money via SOC2 processor (Earnnest/Payload) → buyer bank →
  designated FL bank escrow OR licensed title company escrow.
- FL 3-business-day deposit deadline: time-stamp agreementAt, compute
  depositDueBy, track depositedAt, alert on breach (Rule 61J2-14 / §475 F.S.).
- Escrow segregation: sales escrow separate from PM/operating; broker funds
  cap $1,000 (sales) / $5,000 (PM).
- Monthly reconciliation export for broker signature (Rule 61J2-14.012).
- Stripe/Stripe Connect used ONLY for SaaS subs + non-escrow marketplace fees.
- All escrow actions → AuditLog. Broker/attorney reviews before go-live.

═══════════════════════════════════════════════════════════════════
5. PHASED ENGINEERING ROADMAP
═══════════════════════════════════════════════════════════════════
P0 Foundation: Git repo, Next.js app, Supabase/RDS Postgres, Prisma schema,
   Auth+RBAC+MFA, RLS multi-tenant, CI/CD, staging. (current prototype = UI ref)
P1 Live MVP: Amazon IVS single/multi stream + Bridges player, Show/Stream,
   lead capture+routing, 1 social connector (YouTube). Prove ONE loop.
P2 Commerce+Compliance: Stripe Connect subs; Earnnest/Payload escrow webhooks;
   reconciliation exports; appointment + transaction + attribution.
P3 i18n + Global: Next.js i18n (/en /pl /zh /ja) + hreflang; multi-currency;
   intl payment methods; edge video (Asia/EU/NA).
P4 Multi-tenant SaaS: white-label subdomains; agent/brokerage/merchant plans;
   broker dashboards; analytics (PostHog); AI (Claude) clips/lead-qual/moderation.
P5 Scale: more social connectors, Whatnot commerce (manual→API if available),
   more verticals via Vertical rows, 5k+ hosts, autoscale/monitoring.

COST PROTECTION: P0-P1 can run on free tiers + OBS/YouTube; Amazon IVS,
Stripe, Earnnest are usage/paid — activate only with explicit approval.

═══════════════════════════════════════════════════════════════════
6. PLATFORM CATEGORIES AS TENANTS (extension)
═══════════════════════════════════════════════════════════════════
Every category is a Vertical row + category-scoped config — one engine, four fronts:

CATEGORY 1 — REAL ESTATE (vertical: "real-estate")
  Sub-types: New Construction, Apartment Locating, Relocation, Resale.
  Host = licensed agent; Item = Listing (address/beds/price in attributes).
  Compliance: FL/TX license + escrow rules ACTIVE.
CATEGORY 2 — BRIDGES MATCHA (vertical: "matcha", e-commerce)
  Host = brand/creator; Item = Product (sku/price/variants in attributes).
  Live ceremonial tastings → Stripe checkout (Bridges HQ fulfillment).
  Compliance: standard e-com terms; NO real-estate escrow.
CATEGORY 3 — GLOBAL TRADE (vertical: "global-trade", B2B)
  Host = sourcing rep; Item = Lot/Container (MOQ, incoterms in attributes).
  Live sourcing shows → quote/RFQ lead (not instant checkout).
CATEGORY 4 — EXTERNAL BUSINESS SaaS (any vertical)
  External realtors/merchants get Organization + subdomain + plan.
  RLS isolates their data; they host their own live shows under Bridges.

Routing: live.bridgesglobal.co/{lang}/{category}/...
  e.g. /en/real-estate/tampa · /zh/matcha · /pl/global-trade
Each Vertical.complianceRules drives what's required (license? escrow? none).

═══════════════════════════════════════════════════════════════════
7. FREE / LOW-COST MVP IMPLEMENTATION STRATEGY
═══════════════════════════════════════════════════════════════════
Goal: launch the working loop on FREE tiers; pay only per-use when proven.

STEP 1 — Repo + Hosting (FREE)
  - GitHub repo (free).
  - Vercel free tier: deploy Next.js app (or keep Cloudflare Pages).
  - Cloudflare free: CDN + DNS (live.bridgesglobal.co already active).
STEP 2 — Database + Auth (FREE)
  - Supabase free tier: Postgres + Auth (magic links, MFA) + RLS.
  - Run Prisma migrations from §2 schema. Seed Vertical rows (RE, matcha, trade).
STEP 3 — Core App (FREE)
  - Next.js App Router; i18n routes /en /pl /zh /ja + hreflang.
  - Pages: category home, live grid, show page, onboarding, admin.
  - RBAC + RLS enforce roles/tenants.
STEP 4 — Video (FREE to start → usage later)
  - Start FREE: OBS → YouTube Live → embed on show page (Track A, live now).
  - Upgrade: Cloudflare Stream (cheap) or Amazon IVS (per-use) for native player
    + WebRTC low-latency; multicast RTMP to TikTok/YouTube/IG via Restream.
STEP 5 — Compliance escrow (per-use, real-estate only)
  - Earnnest or Payload account (broker-linked).
  - Webhook handlers (§3) → EscrowEvent; funds bank→trust/title escrow.
  - SaaS/Stripe NEVER holds earnest money.
STEP 6 — Payments (per-use)
  - Stripe Connect: SaaS subscriptions + Matcha e-commerce + intl methods.
STEP 7 — B2B SaaS portal
  - External signup → Organization + subdomain + plan (agent/brokerage/merchant).
  - They stream under Bridges; RLS isolates; Stripe bills their subscription.

COST LADDER (nothing auto-charges):
  Phase A (prove loop): GitHub + Vercel/Cloudflare + Supabase + OBS/YouTube = $0.
  Phase B (native video): Cloudflare Stream / Amazon IVS = usage-based.
  Phase C (money): Stripe (fees per txn) + Earnnest (per deal) = only when transacting.
  Phase D (scale): Redis, workers, more edge — managed, scales with revenue.

DELIVERABLES STATUS (this prompt's §5):
  1. Architecture flow diagram — DONE (system diagram + agent→revenue flow).
  2. Prisma schema (users/tenants/listings/streams/orders/escrow logs) — DONE (§2).
  3. API specs (live WS + earnest webhooks) — DONE (§3).
  4. Free-tier MVP strategy (Vercel/Supabase/Cloudflare) — DONE (this §7).

═══════════════════════════════════════════════════════════════════
8. LEGAL BOUNDARY — SaaS (Zillow model) vs BROKERAGE (extension)
═══════════════════════════════════════════════════════════════════
CORE PRINCIPLE: Bridges Live (the software) is a B2B SaaS / advertising
technology platform — NOT a brokerage. Like Zillow Premier Agent, the
software may host, stream, manage accounts, list, and route leads. It may
NOT perform licensed acts or collect real-estate commission directly.

TWO LEGAL LANES (enforce in code + billing):
  A. NON-LICENSED (software) — allowed to monetize:
     - SaaS subscriptions (agent/brokerage/merchant plans)
     - Flat listing/advertising fees, featured placement
     - Platform technology / streaming fees
     - Lead-routing as a tech service (NOT a per-close success fee to
       an unlicensed party)
  B. LICENSED (brokerage) — performed by LPT Realty / licensed agents:
     - Live property walk-throughs, showing representation
     - Transaction negotiation, buyer/seller representation
     - Real-estate COMMISSION — flows only through the registered
       brokerage; software never takes a commission split.

REFERRAL COMPLIANCE (FREC §475.42 / TREC):
  - Agent↔agent / brokerage↔brokerage referral fees route ONLY via
    licensed broker-to-broker referral agreements.
  - Software records referral metadata + routes to brokerage; it does
    not pay referral fees to unlicensed persons (RESPA §8).

BILLING SEPARATION (in schema):
  - Subscription/Payment (SaaS) = software revenue (any org).
  - RevenueEvent.type = "commission" | "referral" flagged as
    BROKERAGE-routed, not platform-collected. Store brokerage_id +
    referral_agreement_ref on those events for audit.

ESCROW (unchanged, reinforced): software never touches earnest money;
Earnnest/Payload route bank→title/broker-trust; 3-day FREC tracking.

═══════════════════════════════════════════════════════════════════
9. FOURTH CHANNEL — 501(c)(3) NONPROFIT HOUSING PORTAL (isolated)
═══════════════════════════════════════════════════════════════════
Gift of God Ministries = separate nonprofit. STRICT functional isolation
from the commercial platform (legal + data + billing):
  - Separate Vertical row: "nonprofit-housing" (complianceRules = nonprofit).
  - No commercial lead routing into/out of nonprofit content.
  - No commission/referral logic touches nonprofit records.
  - Content: free housing-education workshops, first-time buyer guides,
    grant-supported community resources.
  - Donations/grants (if any) tracked separately from SaaS/e-com revenue.
  - Public site links to it (already: giftofgodministries.org/housing-ministry)
    but data + funds never commingle with the brokerage/SaaS.

Schema additions:
model HousingResource {          // nonprofit content (isolated)
  id        String @id @default(uuid())
  type      String  // "workshop","guide","grant-program"
  title     String
  body      String
  isNonprofit Boolean @default(true)   // hard flag; excluded from commercial queries
  createdAt DateTime @default(now())
}
model Donation {                 // nonprofit only — NEVER via brokerage escrow/Stripe-commission
  id        String @id @default(uuid())
  donorName String?
  amount    Decimal
  source    String  // "grant","individual"
  restricted Boolean @default(false)
  createdAt DateTime @default(now())
}
RLS: nonprofit rows isolated by vertical_id="nonprofit-housing"; commercial
roles cannot read/write nonprofit financial rows and vice-versa.

═══════════════════════════════════════════════════════════════════
10. FOUR VERTICAL CHANNELS (final structure)
═══════════════════════════════════════════════════════════════════
1. Commercial Real Estate — walkthroughs, new construction, apartments,
   relocation, resale. (licensed acts via brokerage; escrow via Earnnest)
2. External Agent SaaS Portal — third-party licensed realtors stream under
   THEIR OWN sponsoring-brokerage disclosure; subdomain + plan + RLS.
3. Bridges Matcha & Global Trade — e-commerce store, wholesale sourcing,
   live ceremonial tastings. (Stripe checkout; no RE escrow)
4. Nonprofit Housing Portal (501c3) — free education, buyer guides, grants.
   (isolated; no commercial routing)

DELIVERABLES STATUS (this prompt §4):
  1. End-to-end system & COMPLIANCE architecture — DONE (diagrams + §8).
  2. Prisma schema incl. e-commerce + 501c3 + escrow logs — DONE (§2 + §9).
  3. API specs (live WS + escrow webhooks) — DONE (§3).
  4. MVP→global roadmap — DONE (§5 + §7).
