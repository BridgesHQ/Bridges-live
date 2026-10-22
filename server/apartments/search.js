// Apartment search for /apartment-locating. Real rental communities from RealtyAPI's apartments endpoint,
// fetched server-side so the key (REALTYAPI_KEY) never reaches the browser. Nothing is invented: when no key is
// set, or the feed is down, the page shows a "tell us what you need" request instead of results.
import { config } from "../config.js";

const L = () => config.listings;
const cache = new Map(); // location → { at, rows }
const TTL = 30 * 60 * 1000;

export const apartmentsEnabled = () => Boolean(L().realtyKey);

const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? Number(m[0]) : 0; };
const nums = (s) => (String(s ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/g) || []).map(Number);
const bedMin = (s) => (/studio/i.test(s || "") ? 0 : nums(s)[0] ?? null);

/** One community, mapped to what the page shows. Fields the feed does not send stay null. */
export function mapApartment(x, area) {
  const plans = (x.floorPlans || x.models || x.rentals || []).map((p) => ({
    name: p.name || p.modelName || p.planName || "",
    beds: p.beds ?? p.bedrooms ?? (p.bedText ? bedMin(p.bedText) : null),
    baths: p.baths ?? p.bathrooms ?? (p.bathText ? num(p.bathText) : null),
    sqft: p.sqft ?? p.squareFeet ?? (p.sqftText || p.squareFeetText ? nums(p.sqftText || p.squareFeetText)[0] : null),
    rent: p.rent ?? p.price ?? (p.rentText || p.priceText ? nums(p.rentText || p.priceText)[0] : null),
    available: p.availability || p.availableText || "",
  })).filter((p) => p.name || p.sqft || p.rent);
  const sq = nums(x.sqftRange || x.squareFeetRange);
  const ba = nums(x.bathRange);
  return {
    id: String(x.listingKey || x.id || x.oneLineAddress || ""),
    name: x.name || x.oneLineAddress || "Apartment community",
    city: (x.address && (x.address.city || x.address.addressCity)) || area,
    address: x.oneLineAddress || [x.address?.streetAddress, x.address?.city, x.address?.state].filter(Boolean).join(", "),
    rentMin: nums(x.rentRange || x.priceRange)[0] ?? null,
    rentText: x.rentRange || x.priceRange || "",
    bedMin: bedMin(x.bedRange), bedText: x.bedRange || "",
    bathMin: ba[0] ?? null, sqftMin: sq[0] ?? null, sqftMax: sq[1] ?? sq[0] ?? null,
    deal: x.rentDeals ? `${x.rentDeals} move-in special${x.rentDeals > 1 ? "s" : ""}` : x.availabilityText || "",
    rating: x.rating || null, manager: x.propertyManager?.name || "", phone: x.phone || "",
    amenities: (x.amenityNames || x.amenities || []).map(String).slice(0, 40),
    specialties: x.specialties || [],
    photo: x.primaryImage || x.photo || (x.photos && x.photos[0]) || "",
    tour: x.threeDScanUrl || x.multimediaUrl || "",
    plans,
  };
}

export async function searchApartments(location) {
  const loc = String(location || "Tampa, FL").slice(0, 80);
  const hit = cache.get(loc);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const url = `${L().apartmentsBase}/search/bylocation?location=${encodeURIComponent(loc)}&perPage=200`;
  const r = await fetch(url, { headers: { "x-realtyapi-key": L().realtyKey, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`apartments feed HTTP ${r.status}`);
  const data = await r.json();
  const rows = (data.searchResults || data.listings || data.results || []).map((x) => mapApartment(x, loc.split(",")[0]));
  cache.set(loc, { at: Date.now(), rows });
  return rows;
}
