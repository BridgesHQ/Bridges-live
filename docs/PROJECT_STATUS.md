# Bridges Live — Project Status
Updated: 2026-09-07

## What is REAL vs PROTOTYPE (verified)
| System | Status | Notes |
|---|---|---|
| Frontend | ✅ REAL | Static HTML/JS, Cloudflare Pages, 45+ pages |
| Hosting | ✅ REAL | Cloudflare Pages (project: bridges-live) |
| DNS | ✅ REAL | live.bridgesglobal.co — Active, SSL |
| Database | ⚠️ PARTIAL | Supabase Postgres, only `leads` table |
| Property data | ✅ REAL | RealtyAPI (apartments) + ShowingNew (new construction) |
| Lead capture | ✅ REAL | Forms → Supabase `leads` |
| Analytics | ⚠️ PARTIAL | GA4 tag only; no event model |
| Auth | ❌ PROTOTYPE | Admin uses demo password |
| Livestream | ❌ MISSING | UI only; no IVS/Mux/video pipes |
| Social OAuth | ❌ MISSING | Manual/embed only |
| CRM | ❌ MISSING | — |
| Payments | ❌ MISSING | Stripe not connected |
| Monitoring | ❌ MISSING | — |

## Two tracks (per Master Execution Prompt §2)
- TRACK A (tomorrow's MVP): go live via YouTube/TikTok → embed → capture lead. BUILDABLE NOW.
- TRACK B (full platform): backend, DB schema, RBAC, video, CRM, payments. DEVELOPER WORK.
