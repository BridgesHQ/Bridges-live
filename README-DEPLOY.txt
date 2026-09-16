BRIDGES — live.bridgesglobal.co  (one Cloudflare Pages project)
================================================================

WHAT'S IN HERE
  /                     Marketing site (Tampa Bay primary, Austin secondary)
  /live/                Bridges Live app (live-tour marketplace — backend intact)
  /blog/                Blog index + 10 full-layout articles
  /relocation-guide/    Free lead-magnet landing page (email opt-in)
  /assets/              Your logo + headshot + city photos
  /assets/cities/       Drop your own city photos here (README inside)
  _headers, sitemap.xml, robots.txt

DEPLOY (Cloudflare Pages)
  1. Open your existing "bridges-live" project (or create one new Pages project).
  2. Create deployment -> upload the CONTENTS of this folder as the site root.
  3. Custom domain: live.bridgesglobal.co
  4. Do NOT touch bridgesglobal.co (stays on Lofty / IDX).
  Result:  /  = marketing + blog + guide,  /live/ = the app.

=================  PLACEHOLDERS TO SWAP (do these to earn) ==================

1) EMAIL FORM (newsletter + lead magnet)
   Search the project for:  REPLACE-WITH-YOUR-EMAIL-PROVIDER.example
   Replace that form "action" URL with your Mailchimp or ConvertKit
   embedded-form POST URL. Appears in every article opt-in and on
   /relocation-guide/. Then build your welcome sequence in that tool:
     Day 0 guide · Day 1 framework · Day 3 mistakes · Day 5 tools
     · Day 7 affiliate offer · Day 10 roundup.

2) AFFILIATE LINKS
   Search for:  #REPLACE-AFFILIATE-LINK
   Replace with your real partner URLs (movers, insurance, mortgage,
   renters insurance, tenant screening, utilities). Keep rel="sponsored".

3) STRIPE (Bridges Live paid tiers)
   In /live/index.html, top of the <script>, fill the STRIPE = {...}
   object with your Payment Link URLs (pro, featured, deposit).

4) LOGO + PHOTOS
   Save your logo as /assets/logo.webp AND /live/assets/logo.webp.
   (Headshot dorota.webp already included.)
   Optional: drop city photos into /assets/cities/ (see its README).

5) LEAD-MAGNET PDF
   The /relocation-guide/ page collects emails; deliver your actual
   PDF via your email tool's welcome email (Day 0).

NAV STRUCTURE
  New Construction (Tampa / Parrish / Sarasota) · Apartment Locating ·
  Bridges Live · Relocation · Sell · Blog · Free Guide · Watch Live

SOCIAL LINKS (Live app footer): TikTok @dorotabridges, YouTube channel
  UC1-P1o5Zyz9eJF2Vg9TuZqA, IG @realtor_dorota, FB /DorotaBRIDGES,
  LinkedIn /in/dorotabridges, Zillow /profile/realtordorota.
