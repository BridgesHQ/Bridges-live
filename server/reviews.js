// Yelp rating for the trust badge and AggregateRating schema — real figures only.
// Source 1: Yelp Fusion API (YELP_API_KEY), cached 12h. Source 2: the owner's own current Yelp
// numbers (YELP_RATING + YELP_REVIEW_COUNT). With neither, nothing is shown and no rating schema is emitted.
import { config } from "./config.js";

const R = () => config.reviews;
const url = () => `https://www.yelp.com/biz/${R().yelpBusiness}`;
let cache = { at: 0, value: null };

export async function yelpRating() {
  if (R().yelpKey) {
    if (Date.now() - cache.at < 12 * 3600_000 && cache.value) return cache.value;
    try {
      const r = await fetch(`${R().yelpBase}/businesses/${encodeURIComponent(R().yelpBusiness)}`, { headers: { Authorization: `Bearer ${R().yelpKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.rating && j.review_count) {
        // up to 3 real review excerpts (Yelp's own limit), for the Review schema
        const rv = await fetch(`${R().yelpBase}/businesses/${encodeURIComponent(R().yelpBusiness)}/reviews?limit=3&sort_by=yelp_sort`, { headers: { Authorization: `Bearer ${R().yelpKey}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
          .then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
        const reviews = (rv.reviews || []).filter((x) => x.text && x.rating).map((x) => ({ author: x.user?.name || "Yelp user", rating: Number(x.rating), text: String(x.text).slice(0, 300), date: String(x.time_created || "").slice(0, 10) }));
        cache = { at: Date.now(), value: { rating: Number(j.rating), count: Number(j.review_count), url: j.url ? String(j.url).split("?")[0] : url(), source: "yelp-api", reviews } };
        return cache.value;
      }
      console.warn("[reviews] Yelp API:", r.status, j.error?.description || "");
    } catch (e) { console.warn("[reviews] Yelp API:", e.message); }
  }
  if (R().rating && R().count) return { rating: R().rating, count: R().count, url: url(), source: "owner", reviews: [] };
  return { rating: null, count: null, url: url(), source: null, reviews: [] };
}

/** AggregateRating JSON-LD for the RealEstateAgent, or "" when there are no real figures. */
export async function ratingJsonLd() {
  const y = await yelpRating();
  if (!y.rating) return "";
  const o = { "@context": "https://schema.org", "@type": "RealEstateAgent", "@id": "https://live.bridgesglobal.co/#org", name: "Bridges Global — Dorota Maslowska, LPT Realty",
    sameAs: [y.url], aggregateRating: { "@type": "AggregateRating", ratingValue: y.rating, reviewCount: y.count, bestRating: 5, worstRating: 1 },
    ...((y.reviews || []).length ? { review: y.reviews.map((x) => ({ "@type": "Review", author: { "@type": "Person", name: x.author }, datePublished: x.date || undefined, reviewBody: x.text,
      reviewRating: { "@type": "Rating", ratingValue: x.rating, bestRating: 5 }, publisher: { "@type": "Organization", name: "Yelp" } })) } : {}) };
  return `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
}
