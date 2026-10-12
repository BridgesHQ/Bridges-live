# Today's Content — daily video scripts

/admin → 🎬 **Today's Content** gives you one short vertical video per day:
hook · 30–45 s script with timings · on-screen text · phone **shotlist** · caption · hashtags ·
a "before you post" check. Copy buttons for the script and caption + hashtags; mark it
Draft → Filmed → Posted.

| Day | Theme |
|---|---|
| Monday | Market update & builder incentive |
| Tuesday | Model home tour |
| Wednesday | Buyer tip |
| Thursday | New community spotlight |
| Friday | Neighborhood guide (rotates through 14 areas week to week) |
| Saturday | Weekend live tour invite |
| Sunday | Relocation Q&A |

**AI:** with `ANTHROPIC_API_KEY` set, each post is written by Claude (default model in server/config.js, override with
`ANTHROPIC_MODEL`) using structured JSON output, with Fair Housing and Florida advertising rules in
the prompt (broker line on every caption, no invented numbers — they appear as `[brackets]` for you
to fill in). Without a key (or if the AI call fails) a built-in template is used, so the tab is never
empty. Cost is a few cents per post.

**Automatic:** the cron job that sends follow-ups (`POST /api/cron/followups`, every 15 min) also
writes the day's post if it doesn't exist and emails it to `LEAD_ALERT_EMAIL` once each morning.

**AI video tool (later):** `server/content/video.js` is the plug-in point. Today it supports
`VIDEO_PROVIDER=webhook` + `VIDEO_WEBHOOK_URL` (sends the script/shotlist/caption JSON to Zapier,
Make or your own job). `VIDEO_PROVIDER=higgsfield` + `HIGGSFIELD_API_KEY` is reserved — add the API
call in `higgsfield()` when you choose a plan. The admin shows a "Send to video tool" button.

**Database:** `backend/sql/migrations/005_content_and_cleanup.sql` (table `content_posts`).
