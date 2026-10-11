# Live streaming — many agents live at once (Cloudflare Stream)

```
agent applies on /become-a-streamer ──► admin approves in /admin (or auto-approve)
   │                                       │ server creates a Cloudflare "live input" for that agent
   │                                       ▼
   │                    agent gets a private link  /go-live/#t=…  (emailed + shown on screen)
   │                       shows: RTMPS URL + stream key, Larix (phone) and OBS (computer) steps
   ▼
agent presses Go Live in Larix/OBS ──► Cloudflare ──► HLS playback on /live-marketplace
                                                       grid flips "OFFLINE" → "LIVE", live agents sort first
viewers: "Request a showing" / "Reserve" ──► /api/showings, /api/holds ──► lead pipeline
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
| `SHOW_SEED_STREAMS` | `false` hides the demo streams once real agents broadcast |

Check `/api/health` → `"video": "cloudflare"` when all three are set.

**Cost:** Cloudflare Stream has no free tier — roughly $5/month per 1,000 minutes stored and
$1 per 1,000 minutes watched. Live inputs record automatically (replays); delete old recordings
in the Cloudflare dashboard to keep storage low.

## Admin
- **/admin → Approvals:** approving creates the agent's input and shows their host link.
  **New host link** replaces a lost/leaked link (old one stops working). Rejecting deletes the input.
- Cloudflare streams show an **on air / offline** pill (checked every 20 s).

## Database
Run `backend/sql/migrations/004_streams_private.sql` in Supabase → SQL Editor (stops the public
anon key from reading the streams table; the site reads streams through the server).

## Security
The stream key is never stored — it is fetched from Cloudflare when the agent opens their link.
The link token is stored only as a hash, lives in the URL `#fragment` (never sent to analytics or logs),
and the /go-live page has no tracking scripts.
