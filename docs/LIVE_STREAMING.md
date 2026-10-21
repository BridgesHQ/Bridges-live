# Live streaming — you and many agents live at once (Cloudflare Stream)

**You (owner):** /admin → 🔴 Go Live → **Start My Live**. Choose *Stream from my phone* (your own
permanent stream key for Larix/OBS — needs the Cloudflare keys below) or *Paste a live link*
(YouTube / TikTok / Facebook — works today, no keys). Your live is shown first on the homepage,
/live-marketplace and /live-show, with chat and Request-a-showing. **End live** removes it.
The 5-step phone guide is on that admin page. (TikTok has no embeddable live player, so a TikTok
link shows your cover photo with a "Watch live on TikTok" button; YouTube and Facebook play on the site.)

```
agent applies on /become-a-streamer ──► admin approves in /admin (or auto-approve)
   │                                       │ server creates a Cloudflare "live input" for that agent
   │                                       ▼
   │                    agent gets a private link  /go-live/#t=…  (emailed + shown on screen)
   │                       shows: RTMPS URL + stream key, Larix (phone) and OBS (computer) steps
   ▼
agent presses Go Live in Larix/OBS ──► Cloudflare ──► HLS playback on /live-marketplace
                                                       grid flips "OFFLINE" → "LIVE", live agents sort first
viewers: "Request a showing" ──► /api/showings ──► lead pipeline
         (Supabase lead → email alert → HubSpot → 5-touch follow-up), same as every other form
```

Any number of agents can broadcast at the same time — each has their own input and key.
Agents who paste a YouTube/other link instead keep using that (no Cloudflare input).

## Keys (Render → Environment, or `.env`)
| Variable | Where to find it |
|---|---|
| `CF_ACCOUNT_ID` | dash.cloudflare.com → any page → right sidebar **Account ID** |
| `CF_STREAM_TOKEN` | My Profile → API Tokens → Create Token → Custom → permission **Account · Stream · Edit** |
| `CF_SUBDOMAIN` | Stream → open any video/live input → the playback URL host, e.g. `customer-abc123.cloudflarestream.com` |
| `SHOW_SEED_STREAMS` | leave `false` (default) — demo streams are for local testing only |

Check `/api/health` → `"video": "cloudflare"` when all three are set.

**Cost:** Cloudflare Stream has no free tier — roughly $5/month per 1,000 minutes stored and
$1 per 1,000 minutes watched. Live inputs record automatically (replays); delete old recordings
in the Cloudflare dashboard to keep storage low.

## Admin
- **/admin → 👥 Agent streams:** approving creates the agent's input and shows their host link.
  **New host link** replaces a lost/leaked link (old one stops working). Rejecting deletes the input.
- Cloudflare streams show an **on air / offline** pill (checked every 20 s).

## Database
Run `backend/sql/migrations/004_streams_private.sql` and `005_content_and_cleanup.sql` in Supabase →
SQL Editor (004 stops the public anon key reading the streams table; 005 adds Today's Content and
retires the old demo/matcha streams).

## Security
The stream key is never stored — it is fetched from Cloudflare when the agent opens their link.
The link token is stored only as a hash, lives in the URL `#fragment` (never sent to analytics or logs),
and the /go-live page has no tracking scripts.
