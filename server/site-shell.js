// Stamps the shared site shell onto every public page: fonts + site.css, the nav, and the footer
// with the broker disclosure. Run after editing the nav/footer:  npm run site:shell
// Idempotent — each block sits between <!--bl:name--> markers and is replaced on re-run.
// Older content pages keep their content and order; only the nav, footer and type skin change.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, PERSON, faqJsonLd } from "./seo-content.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["live/index.html", "admin/index.html"]); // redirect stub, own app shell

// Hanken Grotesk is self-hosted (OFL) and is the only typeface on the site.
const HEAD = '<!--bl:head--><link rel="preload" href="/assets/fonts/hanken-grotesk.woff2" as="font" type="font/woff2" crossorigin>'
  + '<link rel="stylesheet" href="/assets/css/site.css"><!--/bl:head-->';

// Bespoke mark: a long span and a short span over the Gulf, with the sun just above the water.
export const MARK = '<svg viewBox="0 0 48 32" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle class="sun" cx="40" cy="8" r="3" fill="#1FA595"/>'
  + '<g stroke="#C9A84C" stroke-width="2.2"><path d="M3 26C9 7 27 7 33 26"/><path d="M31 26c2.4-7 9.6-7 12 0"/><path d="M1 26h46"/></g>'
  + '<path d="M12 26v-8M18 26V13M24 26v-8" stroke="#C9A84C" stroke-width="1.4"/><path d="M7 30h10M24 30h16" stroke="#1FA595" stroke-width="1.4" opacity=".7"/></svg>';
export const LOGO = `<a class="bx-logo" href="/" aria-label="Bridges Global — home">${MARK}<b>Bridges<i>Global</i></b></a>`;
const CARET = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const I = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>',
  eho: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M9 14h6M9 17h6"/></svg>',
};

const AREAS = [
  ["/tampa", "Tampa"], ["/brandon", "Brandon"], ["/riverview", "Riverview"], ["/apollo-beach", "Apollo Beach"],
  ["/ruskin", "Ruskin"], ["/lithia", "Lithia &amp; FishHawk"], ["/sun-city-center", "Sun City Center"], ["/wimauma", "Wimauma"],
  ["/wesley-chapel", "Wesley Chapel"], ["/parrish", "Parrish"], ["/lakewood-ranch", "Lakewood Ranch"], ["/bradenton", "Bradenton"],
  ["/sarasota", "Sarasota"], ["/st-petersburg", "St. Petersburg"], ["/clearwater", "Clearwater"], ["/orlando", "Orlando"],
];
const BUY = [["/buy", "Buy a home", "Shortlist on live video"], ["/listings", "Homes for sale", "Active MLS listings"], ["/new-construction", "New construction", "Builder incentives, buyer-represented"],
  ["/apartment-locating", "Apartments", "Live unit tours"], ["/relocation", "Relocation", "Moving from anywhere"], ["/watch-before-you-fly", "Watch before you fly", "Live video tours from anywhere"]];
const SELL = [["/sell", "Sell your home", "Showings streamed live to buyers"], ["/home-value", "What's my home worth?", "A broker's opinion of value"], ["/list-with-us", "List with us", "Builders &amp; communities"]];
const ABOUT = [["/dorota-maslowska", "Dorota Maslowska", "Broker Associate · LPT Realty"], ["/become-a-streamer", "Stream on Bridges Live", "For licensed agents &amp; builders"],
  ["/blog/", "Insights", "Guides to the Tampa Bay market"], ["/advertise", "Advertise", "Reach buyers while they watch"]];

const panel = (rows) => rows.map(([h, t, s]) => `<a href="${h}">${t}<small>${s}</small></a>`).join("");
const dd = (label, inner, cls = "") => `<div class="bx-dd"><button type="button" aria-expanded="false" aria-haspopup="true">${label}${CARET}</button><div class="bx-panel${cls}">${inner}</div></div>`;
const sheetGroup = (label, rows) => `<details><summary>${label}</summary><div>${rows.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</div></details>`;

export const NAV = `<!--bl:nav--><header class="bx-nav" id="bx-nav"><div class="bx-nav-in">
${LOGO}
<nav class="bx-menu" aria-label="Main">
<a href="/live-marketplace"><span class="bx-dot"></span>Live</a>
<a href="/new-construction">New Construction</a>
<a href="/apartment-locating">Apartments</a>
${dd("Neighborhoods", `<div class="lbl">Tampa Bay, Sarasota &amp; Austin</div><a href="/neighborhoods">All neighborhoods</a>${AREAS.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}`, " grid")}
<a href="/relocation">Relocation</a>
<a href="/listings">Listings</a>
</nav>
<div class="bx-act"><a class="bx-tel" href="tel:+18137818888">${I.phone}<span>813-781-8888</span></a><a class="bx-btn" href="/listings" data-showing data-source="Website — Nav">Request a showing</a></div>
<a class="bx-mlive" href="/live-marketplace"><span class="bx-dot"></span>Live</a>
<button class="bx-burger" id="bx-burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="bx-sheet"><span></span></button>
</div></header>
<div class="bx-sheet" id="bx-sheet">
<a href="/live-marketplace">Live</a><a href="/new-construction">New Construction</a><a href="/apartment-locating">Apartments</a>
${sheetGroup("Neighborhoods", [["/neighborhoods", "All neighborhoods"], ...AREAS])}<a href="/relocation">Relocation</a><a href="/listings">Listings</a>${sheetGroup("More", [["/buy", "Buy a home"], ["/sell", "Sell your home"], ...ABOUT.map(([h, t]) => [h, t])])}
<div class="bx-sheet-cta"><a class="bx-btn" href="/listings" data-showing data-source="Website — Mobile menu">Request a showing</a><a class="bx-btn bx-btn--line" href="tel:+18137818888">${I.phone}Call 813-781-8888</a>
<small>Dorota Maslowska, Broker Associate · LPT Realty · FL BK3519799</small></div>
</div><!--/bl:nav-->`;

export const FOOTER = `<!--bl:footer--><footer class="bx-foot bx-grain"><div class="bx-wrap">
<div class="bx-foot-cta"><h2>See it live. <em>Then see it in person.</em></h2><div class="bx-btns"><a class="bx-btn bx-btn--gold" href="/listings" data-showing data-source="Website — Footer">Request a showing</a><a class="bx-btn bx-btn--glass" href="/live-marketplace"><span class="bx-dot"></span>Watch live tours</a></div></div>
<div class="bx-foot-grid">
<div class="bx-foot-brand">${LOGO}<p>Real estate, streamed live — Tampa Bay, Sarasota, Austin and relocation from anywhere, with a licensed broker on the other side of every request.</p>
<div class="bx-foot-contact"><a href="tel:+18137818888">${I.phone}813-781-8888</a><a href="mailto:dd@bridgesglobal.co">${I.mail}dd@bridgesglobal.co</a><a href="https://wa.me/13013796785" data-whatsapp data-label="Footer">${I.wa}WhatsApp</a></div></div>
<div class="bx-foot-col"><h4>Buy &amp; rent</h4><a href="/buy">Buy a home</a><a href="/listings">Homes for sale</a><a href="/new-construction">New construction</a><a href="/apartment-locating">Apartments</a><a href="/relocation">Relocation</a><a href="/relocation-guide/">Relocation guide</a></div>
<div class="bx-foot-col"><h4>Sell</h4><a href="/sell">Sell your home</a><a href="/home-value">Home value</a><a href="/list-with-us">List with us</a><a href="/housing-resources">Housing resources</a></div>
<div class="bx-foot-col"><h4>Neighborhoods</h4><a href="/neighborhoods">All neighborhoods</a><a href="/tampa">Tampa</a><a href="/brandon">Brandon</a><a href="/riverview">Riverview</a><a href="/wesley-chapel">Wesley Chapel</a><a href="/parrish">Parrish</a><a href="/sarasota">Sarasota</a></div>
<div class="bx-foot-col"><h4>Bridges Live</h4><a href="/live-marketplace">Watch live</a><a href="/live-show">The live show</a><a href="/become-a-streamer">Stream with us</a><a href="/blog/">Insights</a><a href="/dorota-maslowska">About Dorota</a></div>
</div>
<div class="bx-legal"><div class="bx-eho">${I.eho}Equal Housing Opportunity</div>
<p><b>Dorota Maslowska, Broker Associate · LPT Realty.</b> Florida License BK3519799 · Texas License 829789-SA. All real estate services are provided through LPT Realty. Bridges Global and Bridges Live are marketing and technology services, not a brokerage. Listing information is deemed reliable but not guaranteed; prices, incentives and market figures change frequently — verify before making decisions. Listings may be held by other brokerages. Earnest money is never collected through this website.</p></div>
<aside class="bx-min" aria-label="Giving back — Gift of God Ministries"><div><span class="k">Giving Back</span><h3>Gift of God Ministries</h3>
<p class="v">&ldquo;By wisdom a house is built, and through understanding it is established.&rdquo; &mdash; Proverbs 24:3</p>
<p>A portion of every Bridges transaction supports Gift of God Ministries &mdash; a 501(c)(3) nonprofit providing housing education, relocation resources, and support to families in need across our communities. Wisdom builds. Bridges connect.</p></div>
<div class="bx-btns"><a class="bx-btn bx-btn--gold bx-btn--sm" href="https://giftofgodministries.org/housing-ministry/" target="_blank" rel="noopener">Visit Gift of God Ministries</a><a class="bx-btn bx-btn--glass bx-btn--sm" href="/housing-resources">Housing resources</a></div>
<p class="note">Gift of God Ministries is a separate 501(c)(3) nonprofit organization, not a real estate brokerage. Real estate services are provided only through LPT Realty.</p></aside>
<p class="bx-lic">Dorota Maslowska, Broker Associate · LPT Realty · FL License BK3519799 · TX 829789-SA · Equal Housing Opportunity</p>
<div class="bx-bottom"><span>© <span class="bx-y">2026</span> Bridges Global · Tampa Bay, Florida</span><nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/sitemap.xml">Sitemap</a><a href="/admin" rel="nofollow">Owner login</a></nav></div>
</div></footer><script src="/assets/js/site.js" defer></script><!--/bl:footer-->`;

// ---------------------------------------------------------------- v4 (cream / near-black / Bottega green)
// Rolled out page by page: only the pages in V4 get it; everything else keeps the shell above.
export const V4 = new Set(["index.html", "listings/index.html", "buy/index.html", "new-construction/index.html", "apartment-locating/index.html", "sell/index.html", "live-marketplace/index.html", "neighborhoods/index.html"]);
// Colour-version preview (v1 green touch, v2 petrol blue): ?theme= sets it and it follows you across pages.
const THEME_JS = "<script>(function(){var d=document.documentElement,t='v1';try{var m=location.search.match(/[?&]theme=(v[12])/);if(m)sessionStorage.setItem('bl-theme',m[1]);t=sessionStorage.getItem('bl-theme')||t}catch(e){}d.className=d.className.replace(/\\s*theme-v\\d/g,'')+' theme-'+t})();</script>";
const HEAD_V4 = '<!--bl:head-->' + THEME_JS + '<link rel="icon" type="image/svg+xml" href="/assets/mark-v4.svg">'
  + '<link rel="preload" href="/assets/fonts/hanken-grotesk.woff2" as="font" type="font/woff2" crossorigin>'
  + '<link rel="stylesheet" href="/assets/css/v4.css"><!--/bl:head-->';
// The brand mark: two faceted gems meeting at a point (from the Bridges Global card).
const GEM = '<path d="M2 17 20 5 46 3 70 17 46 31 20 29Z"/><path d="M2 17h68M20 5l14 12-14 12M46 3 38 17l8 14M20 5l26 26M46 3 20 29"/>';
export const MARK_V4 = `<svg viewBox="0 0 140 34" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><g class="gem l">${GEM}</g><g class="gem r"><g transform="translate(140 0) scale(-1 1)">${GEM}</g></g></svg>`;
export const LOGO_V4 = `<a class="bx-logo" href="/" aria-label="Bridges Global — home">${MARK_V4}<b>Bridges<i>Global</i></b></a>`;
const NAV_V4 = NAV.replace(LOGO, LOGO_V4);
// The branded footer for the redesigned pages: the real logo (two gems), the Proverbs 24:3 tagline, Gift of God
// Ministries, the LPT compliance line. A faint texture sits behind it — no oversized wordmark.
const FOOTER_V4 = `<!--bl:footer--><footer class="bx-foot v5-foot"><div class="bx-wrap">
<div class="bx-foot-cta"><h2>See it live. <em>Then walk in.</em></h2><div class="bx-btns"><a class="bx-btn bx-btn--gold" href="/listings" data-showing data-source="Website — Footer">Request a showing</a></div></div>
<div class="v5-brand">${LOGO_V4}<div><p class="v5-tag">Wisdom builds. Bridges connect.</p><p class="v5-verse">&ldquo;By wisdom a house is built, and through understanding it is established.&rdquo; &mdash; Proverbs 24:3</p></div></div>
<div class="bx-foot-grid">
<div class="bx-foot-brand"><p>Real estate, streamed live — Tampa Bay, Sarasota, Austin and relocation from anywhere, with a licensed broker on the other side of every request.</p>
<div class="bx-foot-contact"><a href="tel:+18137818888">${I.phone}813-781-8888</a><a href="mailto:dd@bridgesglobal.co">${I.mail}dd@bridgesglobal.co</a><a href="https://wa.me/13013796785" data-whatsapp data-label="Footer">${I.wa}WhatsApp</a></div></div>
<div class="bx-foot-col"><h4>Live &amp; new builds</h4><a href="/live-marketplace">Watch live</a><a href="/new-construction">New construction</a><a href="/listings">Homes for sale</a><a href="/list-with-us">For builders</a><a href="/become-a-streamer">Stream with us</a></div>
<div class="bx-foot-col"><h4>Rent &amp; move</h4><a href="/apartment-locating">Apartments</a><a href="/relocation">Relocation</a><a href="/relocation-guide/">Relocation guide</a><a href="/buy">Buy a home</a><a href="/sell">Sell your home</a></div>
<div class="bx-foot-col"><h4>Neighborhoods</h4><a href="/neighborhoods">All neighborhoods</a><a href="/tampa">Tampa</a><a href="/st-petersburg">St. Petersburg</a><a href="/sarasota">Sarasota</a><a href="/lakewood-ranch">Lakewood Ranch</a><a href="/parrish">Parrish</a></div>
<div class="bx-foot-col"><h4>Bridges</h4><a href="/dorota-maslowska">About Dorota</a><a href="/live-show">The live show</a><a href="/blog/">Insights</a><a href="/housing-resources">Housing resources</a></div>
</div>
<aside class="bx-min" aria-label="Giving back — Gift of God Ministries"><div><span class="k">Giving Back</span><h3>Gift of God Ministries</h3>
<p>A portion of every Bridges transaction supports Gift of God Ministries &mdash; a 501(c)(3) nonprofit providing housing education, relocation resources, and support to families in need across our communities. Wisdom builds. Bridges connect.</p></div>
<div class="bx-btns"><a class="bx-btn bx-btn--gold bx-btn--sm" href="https://giftofgodministries.org/housing-ministry/" target="_blank" rel="noopener">Visit Gift of God Ministries</a><a class="bx-btn bx-btn--glass bx-btn--sm" href="/housing-resources">Housing resources</a></div>
<p class="note">Gift of God Ministries is a separate 501(c)(3) nonprofit organization, not a real estate brokerage. Real estate services are provided only through LPT Realty.</p></aside>
<div class="bx-legal"><div class="bx-eho">${I.eho}Equal Housing Opportunity</div>
<p><b>Dorota Maslowska, Broker Associate · LPT Realty.</b> Florida License BK3519799 · Texas License 829789-SA. All real estate services are provided through LPT Realty. Bridges Global and Bridges Live are marketing and technology services, not a brokerage. Listing information is deemed reliable but not guaranteed; prices, incentives and market figures change frequently — verify before making decisions. Listings may be held by other brokerages. Earnest money is never collected through this website.</p></div>
<p class="bx-lic">Dorota Maslowska, Broker Associate · LPT Realty · FL License BK3519799 · TX 829789-SA · Equal Housing Opportunity</p>
<div class="bx-bottom"><span>© <span class="bx-y">2026</span> Bridges Global · Tampa Bay, Florida</span><nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/sitemap.xml">Sitemap</a><a href="/admin" rel="nofollow">Owner login</a></nav></div>
</div></footer><script src="/assets/js/site.js" defer></script><!--/bl:footer-->`;

// "Why Bridges" — the trust panel stamped into <!--bl:trust--> on the key pages. Every line is a verifiable fact.
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m8.6 12.2 2.4 2.4 4.4-4.8"/></svg>';
export const TRUST = `<!--bl:trust--><section class="wb" aria-labelledby="wb-h"><div class="bx-wrap">
<div class="wb-head"><span class="bx-eyebrow">Why Bridges</span><h2 id="wb-h">Real broker. Real homes. <em>Real tours.</em></h2>
<p>Live shopping has a trust problem: fake listings, paid actors, numbers that don't add up. Bridges is built the other way round.</p></div>
<div class="wb-g">
<div class="wb-i">${TICK}<h3>A licensed broker on every request</h3><p>Dorota Maslowska, Broker Associate with LPT Realty. Florida BK3519799 · Texas 829789-SA. <a href="https://www.myfloridalicense.com/" target="_blank" rel="noopener">Verify the license</a></p></div>
<div class="wb-i">${TICK}<h3>Real MLS listings</h3><p>Homes come from the MLS with the listing brokerage and MLS number shown. No placeholder or sample homes, ever.</p></div>
<div class="wb-i">${TICK}<h3>Verified live tours</h3><p>Only approved, licensed agents and builders can stream. The LIVE badge and viewer count appear only while a camera is really on air.</p></div>
<div class="wb-i">${I.eho}<h3>Fair Housing</h3><p>Equal Housing Opportunity. Every buyer and renter gets the same homes, the same information and the same service.</p></div>
</div></div></section><!--/bl:trust-->`;

function block(html, name, value, fallback) {
  const re = new RegExp(`<!--bl:${name}-->[\\s\\S]*?<!--/bl:${name}-->`);
  return re.test(html) ? html.replace(re, () => value) : fallback(html);
}

const escH = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const answerBlock = (c) => `<!--bl:answer--><section class="bx-answer" aria-label="In short"><div class="bx-wrap"><span class="bx-eyebrow">In short</span><p>${escH(c.answer)}</p></div></section><!--/bl:answer-->`;
const faqBlock = (c) => `<!--bl:faq--><section class="bx-faq" aria-labelledby="faq-h"><div class="bx-wrap"><span class="bx-eyebrow">Questions</span><h2 id="faq-h">Good to know</h2>`
  + c.faqs.map((f) => `<details><summary>${escH(f.q)}</summary><p>${escH(f.a)}</p></details>`).join("") + `</div></section><!--/bl:faq-->`;

/** Answer-engine blocks for the key pages: "In short" lead, visible FAQ, FAQPage (+ Person/RealEstateAgent) JSON-LD. */
function seo(html, rel) {
  const c = PAGES[rel];
  // every page carries the broker / RealEstateAgent graph; key pages add their FAQPage
  const graph = [...(c ? [faqJsonLd(c.faqs)] : []), PERSON];
  const schema = `<!--bl:schema-->${graph.map(ld).join("")}<!--/bl:schema-->`;
  html = block(html, "schema", schema, (h) => h.replace("</head>", () => schema + "\n</head>"));
  if (!c) return html;
  html = block(html, "answer", answerBlock(c), (h) => h.replace(/(<header class="hero[^"]*"[\s\S]*?<\/header>)/, (m) => m + answerBlock(c)));
  html = block(html, "faq", faqBlock(c), (h) => h.replace("<!--bl:footer-->", () => faqBlock(c) + "<!--bl:footer-->"));
  return html;
}

export function stamp(html, rel = "") {
  html = seo(html, rel);
  const v4 = V4.has(rel), head = v4 ? HEAD_V4 : HEAD, nav = v4 ? NAV_V4 : NAV, footer = v4 ? FOOTER_V4 : FOOTER;
  html = block(html, "head", head, (h) => h
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>\s*/g, "")
    .replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>\s*/g, "")
    .replace("</head>", () => head + "\n</head>"));
  html = block(html, "nav", nav, (h) => h.replace(/<nav class="bgnav">[\s\S]*?<\/nav>/, () => nav + '<div class="bx-nav-sp"></div>'));
  html = block(html, "trust", TRUST, (h) => h);
  html = block(html, "footer", footer, (h) => h.replace(/<footer>[\s\S]*?<\/footer>/, () => footer));
  // retire the old nav overflow patch and the "representative imagery" captions
  html = html.replace(/<style>\.bgmenu>\.bgdrop:last-child \.bgpanel\{left:auto;right:0\}[^<]*<\/style>\s*/g, "")
    .replace(/<span class="cap">Representative imagery[^<]*<\/span>/g, "");
  if (!/<body[^>]*class="[^"]*bx-/.test(html)) html = html.replace(/<body([^>]*)>/, (m, a) => /class="/.test(a) ? m.replace('class="', 'class="bx-content ') : `<body${a} class="bx-content">`);
  if (!/<html[^>]*no-js/.test(html)) html = html.replace(/<html([^>]*)>/, (m, a) => /class="/.test(a) ? m : `<html${a} class="no-js">`);
  return html;
}

export function pages() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || ["node_modules", "listingreel", "server", "backend", "data", "docs", "functions", "assets"].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "index.html") out.push(path.relative(ROOT, p));
    }
  })(ROOT);
  return out.filter((p) => !SKIP.has(p)).sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let changed = 0;
  for (const rel of pages()) {
    const f = path.join(ROOT, rel), before = fs.readFileSync(f, "utf8"), after = stamp(before, rel);
    if (after !== before) { fs.writeFileSync(f, after); changed++; }
  }
  console.log(`site shell stamped on ${changed} page(s)`);
}
