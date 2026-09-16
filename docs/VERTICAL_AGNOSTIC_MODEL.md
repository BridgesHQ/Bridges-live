# Bridges Live — Vertical-Agnostic Architecture (Phase 10)

## Business decision
Bridges Live is NOT hard-coded to real estate. Real estate is VERTICAL #1.
The same core engine must later support e-commerce, autos, luxury, travel,
services, collectibles, local business — WITHOUT redesigning the core.
DO NOT build other verticals now. Build the DATA MODEL so they can exist later.

## The universal loop (every vertical maps to this)
VERTICAL → HOST → ITEM/PRODUCT → LIVE SHOW → VIEWER → ENGAGEMENT → INTENT
→ LEAD → PURCHASE/TRANSACTION → ATTRIBUTION → REVENUE

## Mapping table (real estate = first instance)
| Universal concept | Real estate | E-commerce | Autos | Travel |
|---|---|---|---|---|
| Vertical | Real Estate | Retail | Automotive | Travel |
| Host | Licensed Agent | Brand/Creator | Dealer | Operator |
| Organization | Brokerage | Store | Dealership | Agency |
| Item/Product | Property | Product | Vehicle | Package |
| Show | Property tour | Live-shopping show | Test-drive show | Destination tour |
| Intent action | Request showing | Add to cart | Request quote | Book |
| Transaction | Home sale | Order | Vehicle sale | Booking |
| Compliance | RE license | Seller terms | Dealer license | Travel license |

## Core generic entities (rename RE-specific → generic)
- Vertical            (id, name, config, compliance_ruleset)
- Organization        (was Brokerage) — tenant root
- Host                (was Agent) — belongs to Organization, has credentials
- HostCredential      (was License) — type varies by vertical (RE license,
                       seller agreement, dealer license…)
- Item                (was Property) — vertical-specific fields in JSONB `attributes`
- ItemAuthorization   (was PropertyAuthorization) — host authorized to show item
- Show                (business event) — host + item(s) + schedule + category
- Stream              (technical video session) — provider/IVS channel/health
- Viewer, EngagementEvent, IntentEvent, Lead, Appointment,
  Transaction, RevenueEvent, Campaign, Subscription, Payment,
  SocialAccount, Notification, AuditLog

## Key design rules
- Every tenant-scoped row carries `vertical_id` + `organization_id` (tenant isolation).
- Item.attributes = JSONB (property fields for RE; SKU/price/variants for e-com).
- Compliance ruleset lives on Vertical, not hard-coded (RE license required to
  transact; e-com may not). Authorization logic reads the vertical's ruleset.
- Show ≠ Stream (business event vs video session) — kept separate.
- Attribution chain is vertical-agnostic:
  Viewer → Source → Host → Organization → Item → Show → Campaign → Action →
  Lead → Appointment → Transaction → Revenue.

## What to build NOW (real estate only) but on this model
Implement the generic tables with vertical_id defaulted to "real-estate".
When e-commerce is added later, insert a new Vertical row + its ruleset — no
schema rewrite. This is the whole point of Phase 10.
