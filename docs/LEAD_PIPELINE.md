# Lead pipeline — visitors and stream viewers → tracked, alerted, followed-up leads

```
every page ── Meta Pixel (PageView) · GA4 G-NN5K59SYSJ · RB2B visitor ID
   │
any lead form / chat assistant / /live-show / showing + hold modals / Go Live
   │  assets/js/lead-pipeline.js  (adds page URL, UTM/fbclid/gclid, SMS consent, bot honeypot)
   ▼
POST /api/lead-router  ──►  Supabase `leads` row (always first — a lead is never lost)
                       ├──►  SMS to you (Twilio)          "🔔 New lead: Ana · 813… · Website — Tampa"
                       ├──►  email to you (Resend)        full details + call/text/email buttons
                       ├──►  CRM (HubSpot upsert and/or GoHighLevel / any webhook)
                       ├──►  Meta Pixel "Lead" + "Book a 15-min call" prompt (Calendly / GHL)
                       └──►  5-touch follow-up: now · +1 day · +3 days · +7 days · +14 days
```

If the server can't be reached (e.g. pages served as plain static files), the form saves straight
to Supabase as before, so leads are never lost (alerts only fire when the server is running).

Repeat submissions from the same email within 12 hours (double clicks, chat follow-up notes) are saved
and emailed to you as an **update**, without another text or a second sequence.

## The 5 touches
| # | When | Channel | Content |
|---|------|---------|---------|
| 1 | immediately | email (+ text*) | Thanks, personal reply coming, **book a call** link |
| 2 | +1 day | email | Watch homes live on Bridges Live |
| 3 | +3 days | text* (email if texting is off) | Timeline / budget question |
| 4 | +7 days | email | Free Tampa Bay relocation guide |
| 5 | +14 days | email | "Should I keep your file open?" (last automatic note) |

\*Texts to leads only when `LEAD_SMS_TO_LEADS=true` **and** the lead gave a phone number on a form
showing the consent line. Every email has an unsubscribe link (one-click); unsubscribing cancels the
remaining touches. Stop anyone's sequence from **/admin → 📣 Lead pipeline**.

## Keys — paste them in Render (Environment) or `.env`
| What | Where | Free? |
|---|---|---|
| `LEAD_ALERT_PHONE`, `LEAD_ALERT_EMAIL` | your mobile (+1…) and email | — |
| Meta Pixel ID → `assets/js/site-config.js` `metaPixelId` | Meta Events Manager → Data sources → Pixel | ✅ |
| RB2B key → `site-config.js` `rb2bKey` | app.rb2b.com → Settings → install script (`reb2b.load("KEY")`) | ✅ free plan (limited IDs/month) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | console.twilio.com | trial credit; texts to **your verified phone** work on trial |
| `RESEND_API_KEY`, `RESEND_FROM` | resend.com → API Keys; **Domains → add bridgesglobal.co** (add the DNS records in Cloudflare) | ✅ 3,000/mo |
| `HUBSPOT_TOKEN` **or** `GHL_WEBHOOK_URL` | HubSpot → Settings → Integrations → Private Apps (contacts read/write) · GHL → Automation → Workflow → trigger "Inbound Webhook" | HubSpot ✅ / GHL paid |
| `BOOKING_URL` | Calendly → your event link (or GHL calendar link) | ✅ |
| `BUSINESS_ADDRESS` | mailing address for email footers (required by CAN-SPAM) | — |
| `CRON_SECRET` | auto-generated on Render | ✅ |

**Keep the follow-ups on time on a free Render instance** (it sleeps after 15 min idle): create a free
job at cron-job.org → every 15 min → `POST https://<your-site>/api/cron/followups` with header
`Authorization: Bearer <CRON_SECRET>`. It also keeps the site awake.

## Compliance — please read
- **Texting leads** (not you) from a US 10-digit number requires **A2P 10DLC registration** in Twilio
  (brand + campaign; small one-time + monthly carrier fees — not free). Until it's approved keep
  `LEAD_SMS_TO_LEADS=false`; leads still get the email touches and you still get SMS alerts.
- Forms with a phone field now show a consent line under the button (calls/texts, automated, STOP to opt out).
- **RB2B** identifies US visitors by name/LinkedIn. Add a line to your privacy policy that you use
  visitor-identification and advertising cookies (Meta Pixel, GA4, RB2B). There is no privacy page on the site yet.
- **Prospects** (Reddit posts) are *not* leads — they never contacted you, so nothing is sent to them
  automatically. Reply personally on Reddit and follow each subreddit's rules.
  Facebook groups are not scraped: it breaks Facebook's terms and needs a logged-in account
  (Apify's Facebook actors require your cookies, so your account could be banned).

## Prospects (optional #7)
`/admin → 🔎 Prospects → Scan Reddit now` (or `npm run prospects:reddit`) searches public Reddit for
"moving to Tampa / St Pete / Sarasota / Wesley Chapel…" posts from the last 2 weeks and stores them in
the `prospects` table. Free, no key. Mark each as contacted / ignored.

## Database
Run once in Supabase → SQL Editor: `backend/sql/migrations/003_lead_pipeline.sql`
(or the full `backend/sql/supabase_setup.sql`, which includes it). Safe to re-run.

## Test it
`npm test` runs the whole flow against fake Twilio / Resend / HubSpot / GoHighLevel servers
(lead saved → SMS + email alerts → CRM → touch 1 sent → dedupe → honeypot → unsubscribe → live-show viewer).
