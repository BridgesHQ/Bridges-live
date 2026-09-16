# Bridges Live — Security Audit (Phase 9)
Principle: PUBLIC pages can be scraped (that's normal). Goal is NOT invisibility.
Goal is: never leak PRIVATE data through public surfaces.

## PUBLIC (fine to be visible)
Marketing pages · public property info · public agent profiles · public live
shows · public content · HTML/CSS/JS source (unavoidable on any website).

## PRIVATE (must never be exposed)
Leads · customer contact info · brokerage data · private analytics · CRM data ·
social OAuth tokens · stream keys · payment info · admin functions · license
documents · internal APIs · DB credentials · business intelligence.

## CURRENT STATE — findings (verified against the prototype)
| Check | Status | Action |
|---|---|---|
| API keys in client code | ✅ FIXED | RealtyAPI key moved server-side (Cloudflare env) |
| Supabase keys | ⚠️ OK-ish | Uses publishable anon key (limited); MUST add RLS |
| Row-Level Security (RLS) | ❌ MISSING | Enable RLS on `leads` + all tables (developer) |
| Real authentication | ❌ MISSING | Admin uses demo password → replace w/ Supabase Auth |
| RBAC | ❌ MISSING | Implement roles (developer) |
| Tenant isolation | ❌ MISSING | Add vertical_id+org_id + RLS policies |
| Admin route protection | ❌ WEAK | /admin is noindex + demo pw only → real auth needed |
| Stream keys exposed | N/A YET | None exist; when IVS added, keep server-side |
| Payment secrets | N/A YET | None; when Stripe added, server-side only |
| Webhook verification | ❌ MISSING | Verify signatures when webhooks added |
| Rate limiting | ❌ MISSING | Add at API/proxy layer |
| Input validation | ⚠️ PARTIAL | Client-side only; add server-side |
| Security headers | ⚠️ PARTIAL | Cloudflare defaults; add CSP/HSTS |
| CORS | ⚠️ DEFAULT | Restrict to own origin for private APIs |
| Audit logs | ❌ MISSING | Log compliance actions (developer) |
| Backups | ✅ OK | Supabase managed backups |
| Error tracking | ❌ MISSING | Add Sentry (developer) |
| Dependency vulns | N/A | No build deps yet (static site) |

## RULES FOR THE DEVELOPER
- Never return private fields from public API responses (least privilege).
- Every private table: RLS ON, policy per role/tenant.
- Secrets only in env/server — never in browser, never in source maps.
- Verify all webhook signatures. Rate-limit all write endpoints.
- Validate + sanitize all input server-side (XSS/SQLi/SSRF/command injection).
- MFA for admin/broker accounts. Secure, httpOnly, sameSite cookies.
- No debug/test endpoints in production. No exposed internal IDs enumeration.

## IMMEDIATE (before any real user data flows)
1. Enable Supabase RLS on `leads` (leads currently insert-only via anon key —
   ensure anon CANNOT read them back).
2. Replace /admin demo password with Supabase Auth + role check.
3. Keep RealtyAPI (and future Stripe/IVS) keys server-side only.
