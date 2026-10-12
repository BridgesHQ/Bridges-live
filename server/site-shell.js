// Stamps the shared site shell onto every static page: fonts, brand.css, the main nav and the
// footer with the broker disclosure. Run after editing the nav/footer:  npm run site:shell
// Idempotent — each block is replaced between its markers, so re-running only updates it.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const ROOT = config.root;
const SKIP = new Set(["live/index.html", "admin/index.html"]); // redirect stub, own app shell

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400;1,500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Marcellus&display=swap" rel="stylesheet">';
const HEAD = `<!--bl:head-->${FONTS}<link rel="stylesheet" href="/assets/css/brand.css"><!--/bl:head-->`;

const AREAS = [
  ["/tampa", "Tampa"], ["/brandon", "Brandon"], ["/riverview", "Riverview"], ["/apollo-beach", "Apollo Beach"],
  ["/ruskin", "Ruskin"], ["/lithia", "Lithia &amp; FishHawk"], ["/sun-city-center", "Sun City Center"], ["/wimauma", "Wimauma"],
  ["/wesley-chapel", "Wesley Chapel"], ["/parrish", "Parrish"], ["/lakewood-ranch", "Lakewood Ranch"], ["/bradenton", "Bradenton"],
  ["/sarasota", "Sarasota"], ["/st-petersburg", "St. Petersburg"], ["/clearwater", "Clearwater"], ["/orlando", "Orlando"],
];

export const NAV = `<!--bl:nav--><div class="bn" id="bn" role="banner"><div class="bn-in">
<a class="bn-logo" href="/" aria-label="Bridges Global home"><img src="/assets/logo-nav.svg" alt="Bridges Global" width="216" height="38"></a>
<a class="bn-mlive" href="/live-marketplace"><span class="bn-dot"></span>Live</a>
<button class="bn-burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="bn-menu" onclick="var n=document.getElementById('bn'),o=n.classList.toggle('open');this.setAttribute('aria-expanded',o);document.body.classList.toggle('bn-lock',o)"><span></span><span></span><span></span></button>
<nav class="bn-menu" id="bn-menu" aria-label="Main">
<div class="bn-drop"><a href="/new-construction">Buy &amp; Rent</a><div class="bn-panel">
<a href="/new-construction">New construction<small>Builder incentives, protected</small></a>
<a href="/apartment-locating">Apartments<small>Free apartment locating</small></a>
<a href="/relocation">Relocation<small>Moving to Tampa Bay</small></a>
<a href="/watch-before-you-fly">Watch before you fly<small>Live video tours from anywhere</small></a>
<a href="/relocation-guide/">Free relocation guide</a></div></div>
<div class="bn-drop"><a href="/sell">Sell</a><div class="bn-panel">
<a href="/sell">Sell your home<small>Live-streamed showings</small></a>
<a href="/home-value">What's my home worth?</a>
<a href="/list-with-us">List with us</a></div></div>
<div class="bn-drop"><a href="/tampa">Neighborhoods</a><div class="bn-panel grid"><div class="lbl">Tampa Bay &amp; beyond</div>
${AREAS.map(([h, t]) => `<a href="${h}">${t}</a>`).join("")}</div></div>
<a href="/blog/">Insights</a>
<div class="bn-drop"><a href="/dorota-maslowska">About</a><div class="bn-panel">
<a href="/dorota-maslowska">Dorota Maslowska<small>Broker Associate · LPT Realty</small></a>
<a href="/become-a-streamer">Stream on Bridges Live<small>For licensed agents &amp; builders</small></a>
<a href="/advertise">Advertise</a>
<a href="/list-with-us">Builders &amp; communities</a></div></div>
<a class="bn-live" href="/live-marketplace"><span class="bn-dot"></span>Watch Live</a>
</nav></div></div>
<script>(function(){var p=location.pathname.replace(/\\/$/,"")||"/";[].forEach.call(document.querySelectorAll(".bn-menu a"),function(a){if(a.getAttribute("href").replace(/\\/$/,"")===p)a.classList.add("on")})})()</script><!--/bl:nav-->`;

const ICON = {
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E3CD8A" stroke-width="1.8"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E3CD8A" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#E3CD8A"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>',
  eho: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M9 14h6M9 17h6"/></svg>',
};

export const FOOTER = `<!--bl:footer--><footer class="bf"><div class="bf-in">
<div class="bf-top">
<div class="bf-brand"><img src="/assets/logo-nav.svg" alt="Bridges Global" width="216" height="38" loading="lazy"><p>Watch real estate live.<br>Request a showing in a tap.</p>
<div class="bf-contact"><a href="tel:+18137818888">${ICON.phone}813-781-8888</a><a href="mailto:dd@bridgesglobal.co">${ICON.mail}dd@bridgesglobal.co</a><a href="https://wa.me/13013796785" data-whatsapp data-label="Footer">${ICON.wa}WhatsApp</a></div></div>
<div class="bf-col"><h4>Buy &amp; Rent</h4><a href="/new-construction">New construction</a><a href="/apartment-locating">Apartments</a><a href="/relocation">Relocation</a><a href="/watch-before-you-fly">Watch before you fly</a><a href="/relocation-guide/">Free guide</a></div>
<div class="bf-col"><h4>Sell</h4><a href="/sell">Sell your home</a><a href="/home-value">Home value</a><a href="/list-with-us">List with us</a><a href="/housing-resources">Housing resources</a></div>
<div class="bf-col"><h4>Neighborhoods</h4><a href="/tampa">Tampa</a><a href="/brandon">Brandon</a><a href="/riverview">Riverview</a><a href="/wesley-chapel">Wesley Chapel</a><a href="/parrish">Parrish</a><a href="/sarasota">Sarasota</a></div>
<div class="bf-col"><h4>Bridges Live</h4><a href="/live-marketplace">Watch live</a><a href="/live-show">Live show</a><a href="/become-a-streamer">Stream with us</a><a href="/blog/">Insights</a><a href="/dorota-maslowska">About Dorota</a></div>
</div>
<div class="bf-legal"><div class="bf-eho">${ICON.eho}Equal Housing<br>Opportunity</div>
<p><b>Dorota Maslowska, Broker Associate · LPT Realty.</b> Florida License BK3519799 · Texas License 829789-SA. All real estate services are provided through LPT Realty. Bridges Global and Bridges Live are marketing and technology services, not a brokerage. Information is deemed reliable but not guaranteed; prices, incentives and market figures change frequently — verify before making decisions. No fees to renters or buyers; compensation is paid by property owners and builders per applicable state law. Earnest money is never collected through this website.</p></div>
<div class="bf-bottom"><span>© <span class="bf-y">2026</span> Bridges Global · Tampa Bay, Florida</span><span><a href="/sitemap.xml">Sitemap</a> · <a href="/admin" rel="nofollow">Owner login</a></span></div>
</div></footer><script>document.querySelectorAll(".bf-y").forEach(function(e){e.textContent=new Date().getFullYear()})</script><!--/bl:footer-->`;

function replaceBlock(html, name, block, fallback) {
  const re = new RegExp(`<!--bl:${name}-->[\\s\\S]*?<!--/bl:${name}-->`);
  if (re.test(html)) return html.replace(re, block);
  return fallback(html);
}

export function stamp(html) {
  html = replaceBlock(html, "head", HEAD, (h) => {
    h = h.replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*/g, "")
      .replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>\s*/g, "");
    return h.replace("</head>", HEAD + "\n</head>");
  });
  html = replaceBlock(html, "nav", NAV, (h) => h.replace(/<nav class="bgnav">[\s\S]*?<\/div><\/nav>/, NAV));
  html = replaceBlock(html, "footer", FOOTER, (h) => h.replace(/<footer[\s\S]*?<\/footer>(\s*<\/footer>)?/, FOOTER));
  return html;
}

function pages(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || ["node_modules", "listingreel", "server", "backend", "data", "docs", "functions", "assets"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pages(p, out);
    else if (e.name === "index.html") out.push(p);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let n = 0;
  for (const file of pages()) {
    const rel = path.relative(ROOT, file);
    if (SKIP.has(rel)) continue;
    const before = fs.readFileSync(file, "utf8");
    const after = stamp(before);
    const missing = ["nav", "footer"].filter((b) => !after.includes(`<!--bl:${b}-->`));
    if (missing.length) console.warn(`  ! ${rel}: no ${missing.join("/")} found`);
    if (after !== before) { fs.writeFileSync(file, after); n++; }
  }
  console.log(`site shell stamped on ${n} page(s)`);
}
