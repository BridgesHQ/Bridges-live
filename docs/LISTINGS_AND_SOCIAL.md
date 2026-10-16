# Real listings + social videos in the stream grid

## Listings (homepage "Homes for sale")
Priority: **Stellar MLS via Bridge Interactive** (`BRIDGE_API_SERVER_TOKEN`) → **RealtyAPI** (`REALTYAPI_KEY`)
→ otherwise a "Search every MLS home" button to `LOFTY_SEARCH_URL` (bridgesglobal.co).
Lofty IDX has no feed that may be reused on another site, so it is linked, not copied.

- Code: `server/listings/sync.js` (replaces `backend/api/sync/stellar-mls-route.ts`).
- Only `StandardStatus eq 'Active'` and `InternetEntireListingDisplayYN eq true` (IDX-approved)
  residential listings in `LISTING_CITIES`; listings without a price, address or photo are never shown.
- Every card shows "Listing courtesy of <brokerage> · MLS#"; the section shows the MLS disclaimer.
- Refreshes hourly via the cron (`/api/cron/followups`), or /admin → 🏡 Listings → Sync now.
- RealtyAPI pulls from public portal data, not an IDX feed — use it only until the MLS token arrives,
  and check with your broker that displaying it is allowed.

## Stream slots (homepage row + /live-marketplace)
`GET /api/slots` — in order: real live streams (Bridges / Cloudflare, or a YouTube live — LIVE badge
and real viewer count), streams starting soon, recent social videos, then "Upcoming" tiles.

| Platform | Keys | What shows |
|---|---|---|
| YouTube | `YOUTUBE_API_KEY`, then **Connect YouTube** (type @handle) in /admin | latest uploads, playable; a live broadcast shows as LIVE |
| Instagram | `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET`, then **Connect Instagram** in /admin (Business/Creator account; redirect `https://live.bridgesglobal.co/api/social/instagram/callback`) | latest Reels, playable; token auto-refreshed |
| TikTok | `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET`, then **Connect TikTok** in /admin | latest videos as cover + "Watch on TikTok" (TikTok blocks embedded playback) |
| Any link | none | /admin → 🎥 Videos → Add a video by link (YouTube, TikTok, Instagram) |

Videos sync every 15 minutes (cron) or on **Sync now**; hide any video from /admin.
TikTok redirect URI to register: `https://live.bridgesglobal.co/api/social/tiktok/callback`.

## Recordings
Every phone live (Cloudflare Stream) is recorded. /admin → 🎥 Videos & recordings → Recordings →
Prepare MP4 → Download MP4, or Show on site (adds a replay tile).

## Database
`backend/sql/migrations/006_listings_social.sql` — tables `mls_listings`, `social_videos`, `app_settings`;
also ends the old demo streams, archives demo listings and deletes their demo chat.

## Income loop self-test
/admin → ⚙️ Setup → **Test the income loop** sends a test "Request a showing" through the same public
endpoint a viewer uses (the live stream if one is on air, else the video/listing form) and reports:
lead saved → email alert → HubSpot → follow-up #1 → follow-ups 2–5 scheduled. The test lead uses a
plus-address of `LEAD_ALERT_EMAIL`, its later follow-ups are cancelled and it is marked Lost / LOOP TEST.

Full click-by-click key steps: /admin → 🧭 How to Operate → 11 · Connections.
