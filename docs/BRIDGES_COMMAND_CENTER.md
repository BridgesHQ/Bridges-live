# Bridges Command Center — Social Aggregation, Moderation & Lead Routing
Central module: one dashboard that ingests ALL comments across every platform,
moderates them, and routes every lead/question back to the exact
agent → builder/org → property → show it came from.

═══════════════════════════════════════════════════════════════════
1. PURPOSE
═══════════════════════════════════════════════════════════════════
When 1 agent (or 5,000) stream to YouTube + TikTok + Instagram + Facebook +
on-site chat at once, comments scatter across platforms. The Command Center:
  - AGGREGATES every comment/question into one unified inbox.
  - MODERATES (spam/abuse filter + human/AI review) before it reaches agents.
  - ATTRIBUTES each message + lead to: agent, org (builder/brokerage),
    property/item, show, source platform, and campaign.
  - ROUTES actionable leads to the right agent instantly (notify + CRM).

═══════════════════════════════════════════════════════════════════
2. DATA SOURCES (ingest adapters)
═══════════════════════════════════════════════════════════════════
- On-site WebSocket chat (native) — direct.
- YouTube Live Chat API — poll/stream live messages.
- Facebook / Instagram Live comments — Meta Graph API.
- TikTok — limited API; where unavailable, manual/assisted capture.
- (Twitch optional.)
Each adapter normalizes to a common CommentEvent shape (below).

═══════════════════════════════════════════════════════════════════
3. ATTRIBUTION CHAIN (every message carries full lineage)
═══════════════════════════════════════════════════════════════════
CommentEvent → show_id → host(agent)_id → org(builder/brokerage)_id →
  item(property)_id → platform → campaign_id → (if actionable) → lead_id
So any comment answers: which agent, which builder, which property, which
show, which platform, which campaign — and becomes a routed, attributed lead.

═══════════════════════════════════════════════════════════════════
4. MODERATION PIPELINE
═══════════════════════════════════════════════════════════════════
Incoming → 1) spam/abuse filter (rules + Claude AI classify) →
  2) auto-hide toxic/spam → 3) flag "intent" messages (question, price ask,
  "how do I buy/reserve") → 4) surface intent to the agent + create Lead →
  5) human moderator override queue. All actions logged (AuditLog).

═══════════════════════════════════════════════════════════════════
5. SCHEMA ADDITIONS (extends existing Supabase schema)
═══════════════════════════════════════════════════════════════════
create table comment_events (
  id uuid primary key default uuid_generate_v4(),
  show_id uuid references shows(id),
  host_id uuid references users(id),           -- agent
  org_id uuid references organizations(id),    -- builder/brokerage
  item_id uuid references listings(id),        -- property
  platform text,                               -- onsite|youtube|tiktok|instagram|facebook
  external_id text,                            -- platform comment id
  author text,
  body text,
  intent text,                                 -- none|question|price|buy|reserve
  moderation text default 'visible',           -- visible|hidden|flagged
  routed_lead_id uuid references leads(id),
  campaign_id uuid,
  created_at timestamptz default now()
);
create index comment_events_show_idx on comment_events(show_id);
create index comment_events_intent_idx on comment_events(intent);

═══════════════════════════════════════════════════════════════════
6. API / EVENTS
═══════════════════════════════════════════════════════════════════
- Ingest workers (per platform) → POST internal → insert comment_events.
- WS channel /ws/command-center → live unified feed to the dashboard.
- POST /api/moderation/:id {action:hide|approve|flag}
- Auto-rule: intent in ('buy','reserve','price') → create Lead +
  route to host_id + notify (email/SMS) + push to CRM.

// normalized CommentEvent
{
  "platform":"youtube","external_id":"ChatId_x",
  "show_id":"str_123","host_id":"agent_9","org_id":"builder_3","item_id":"prop_7",
  "author":"Maria","body":"Is the $340s price still available?",
  "intent":"price","moderation":"visible","ts":"2026-09-09T20:00:00Z"
}

═══════════════════════════════════════════════════════════════════
7. DASHBOARD (in /admin — command center tab)
═══════════════════════════════════════════════════════════════════
- Unified live comment stream (all platforms, color-coded by source).
- Filters: by agent / builder / property / show / platform / intent.
- One-click: hide, approve, reply, convert-to-lead.
- Per-agent + per-property leaderboards (comments → leads → deals).
