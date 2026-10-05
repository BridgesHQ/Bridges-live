# Task Ledger
Statuses: NOT STARTED · IN PROGRESS · BLOCKED · READY FOR TEST · TESTING · COMPLETE

| Task | Status | Owner | Blocker | Next action |
|---|---|---|---|---|
| Front-end prototype | COMPLETE | Claude | — | preserve |
| Audit + architecture + ERD | COMPLETE | Claude | — | hand to developer |
| Track A live-show page | COMPLETE | Claude | — | test on real stream |
| Compliance: remove Reserve/Deposit CTA | COMPLETE | Claude | — | broker/attorney review deposit flow later |
| Amazon IVS video (Track A) | BLOCKED | Developer | needs AWS account + repo | wire IVS player |
| GitHub repo | NOT STARTED | Dorota | needs repo | create + push |
| Database full schema (25 entities) | NOT STARTED | Developer | needs backend | build from ERD |
| Supabase Auth + RBAC | NOT STARTED | Developer | — | replace demo password |
| Amazon IVS video | NOT STARTED | Developer | AWS account | wire player |
| Social OAuth (YouTube/Meta) | NOT STARTED | Developer | API apps | build adapters |
| Stripe Connect | BLOCKED | Dorota | Stripe key | paste key |
| CRM (HubSpot) | NOT STARTED | Dorota+Dev | HubSpot acct | connect |
| Email (Resend) | BLOCKED | Dorota | provider key | paste key |
| SMS (Twilio) | BLOCKED | Dorota | Twilio key | paste key |
| Vertical-agnostic data model (Phase 10) | COMPLETE | Claude | — | developer builds generic schema |
| Security audit doc (Phase 9) | COMPLETE | Claude | — | developer enables RLS + auth |
| Compliance: purge ALL reserve/deposit/60-reserved language | COMPLETE | Claude | — | broker/attorney defines real deposit flow |
| Brand hierarchy: 5 changes (title/meta/H1/schema/brand-bar) | COMPLETE | Claude | — | positions Global umbrella + Live marketplace |
| Production tech spec (schema/API/escrow/roadmap) | COMPLETE | Claude | — | developer builds from spec |
| Legal boundary (SaaS vs brokerage) + nonprofit isolation | COMPLETE | Claude | — | broker/attorney final review |
| 4-language switcher (EN/PL/ZH/JA) | COMPLETE | Claude | — | dev wires i18n routes /en /pl /zh /ja |
| Matcha-first PoC spec (+ compliance boundary) | COMPLETE | Claude | — | build in Claude Code |
| Bridges Command Center spec (social aggregation/moderation/routing) | COMPLETE | Claude | — | build in Claude Code |
| BUILD PHASE → move to Claude Code (repo access) | NOT STARTED | Dorota/Dev | needs GitHub repo | open repo in Claude Code, hand it /backend + /docs |
| Redesign LAYOUT FILES built (not just spec) | COMPLETE | Claude | — | theme.css + 5 components + page.tsx |
| Static redesign preview (light/dark toggle) | COMPLETE | Claude | — | /redesign-preview.html to view |
| Homepage: 3-panel hub at top (hero removed) | COMPLETE | Claude | — | — |
| Pilot toggle (Real Estate <-> Matcha) on action drawer | COMPLETE | Claude | — | wire real Stripe in Claude Code |
| DESIGN DONE → shift to Claude Code for backend/data | READY | Dorota/Dev | needs repo | open in Claude Code, hand /backend + /docs |
| Node server: static site + /api + /ws (WebSocket) | READY FOR TEST | Claude | — | `npm run dev`, see docs/RUN_LOCALLY.md |
| Supabase migrations (idempotent schema + 002 + seed verticals/streams) | READY FOR TEST | Claude | Supabase service key / DB URL | run backend/sql/supabase_setup.sql |
| Live grid + player + realtime chat/viewers + just-bought events | READY FOR TEST | Claude | — | test with 2 browser windows |
| PayPal checkout: matcha Buy now (CAPTURE) + property hold (AUTHORIZE) | READY FOR TEST | Claude | PayPal sandbox keys | paste PAYPAL_CLIENT_ID/SECRET |
| Command Center v1 (comment_events, intent, auto-hold spam, admin moderation) | READY FOR TEST | Claude | — | /admin → Command Center |
| Reserve-hold legal review before PayPal live mode | BLOCKED | Dorota | broker/attorney | set HOLDS_LEGAL_SIGNOFF=true after sign-off |
| Deploy config: render.yaml (free web service) + docs/DEPLOY.md | READY | Claude | Render account | New → Blueprint |
| Streamer approvals (admin approve / take down, Go Live applications) | READY FOR TEST | Claude | — | /admin → Streamer approvals |
| CI: GitHub Actions runs npm test | COMPLETE | Claude | — | — |
| Lead pipeline: Pixel/GA4/RB2B on every page, /api/lead-router, SMS+email alerts, CRM, 5-touch follow-up (text + email, no call booking) | READY FOR TEST | Claude | Pixel ID, RB2B key, Twilio, Resend domain, HubSpot/GHL | paste keys — docs/LEAD_PIPELINE.md |
| Texting leads (A2P 10DLC registration) | BLOCKED | Dorota | Twilio A2P approval (paid) | register brand + campaign, then LEAD_SMS_TO_LEADS=true |
| Privacy policy page (Pixel / GA4 / RB2B disclosure) | NOT STARTED | Dorota | legal text | add /privacy |
| Reddit prospects finder | READY FOR TEST | Claude | — | /admin → Prospects → Scan |
