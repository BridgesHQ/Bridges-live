// Real property listings for the site — never invented. Sources, in priority order:
//   1. Stellar MLS via MLS Grid (MLSGRID_ACCESS_TOKEN) — IDX rows only (MlgCanView + MlgCanUse "IDX").
//   2. Stellar MLS via Bridge Interactive's RESO Web API (BRIDGE_API_SERVER_TOKEN) — IDX rows only
//      (InternetEntireListingDisplayYN). LISTINGS_PROVIDER=mlsgrid uses that token against MLS Grid.
//   3. RealtyAPI (REALTYAPI_KEY) — public, non-MLS data; off unless LISTINGS_ALLOW_NON_MLS=true.
// Every row is shown with its listing brokerage; until a feed is connected the site shows an MLS search link.
// Lofty IDX (bridgesglobal.co) has no feed we may reuse, so the site links out to it instead.
// Rows are cached in `mls_listings`; listings that drop out of the feed are marked inactive.
import { config } from "../config.js";
import { db, setSetting, getSetting } from "../db.js";

const L = () => config.listings;
const mlsgridToken = () => L().mlsgridToken || (L().provider === "mlsgrid" ? L().bridgeToken : "");
export const listingSource = () => (mlsgridToken() ? "mlsgrid" : L().bridgeToken ? "stellar-mls" : L().allowNonMls && L().realtyKey ? "realtyapi" : null);

const num = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const str = (v, n = 200) => (v == null ? "" : String(v).trim().slice(0, n));

// ---------------------------------------------------------------- Stellar MLS (Bridge RESO Web API)
const SELECT = ["ListingKey", "ListingId", "StandardStatus", "ListPrice", "UnparsedAddress", "City", "StateOrProvince", "PostalCode",
  "BedroomsTotal", "BathroomsTotalInteger", "LivingArea", "PropertyType", "PropertySubType", "PublicRemarks", "ListOfficeName",
  "ListAgentFullName", "Latitude", "Longitude", "ModificationTimestamp", "Media"].join(",");

export function mapReso(p) {
  const photos = (p.Media || []).slice().sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0)).map((m) => m.MediaURL).filter(Boolean).slice(0, 12);
  return {
    id: `mls:${p.ListingKey || p.ListingId}`, source: "stellar-mls", mls_number: str(p.ListingId, 40),
    status: String(p.StandardStatus || "Active").toLowerCase() === "active" ? "active" : "inactive",
    price: num(p.ListPrice), address: str(p.UnparsedAddress), city: str(p.City, 80), state: str(p.StateOrProvince, 4) || "FL", zip: str(p.PostalCode, 10),
    beds: num(p.BedroomsTotal), baths: num(p.BathroomsTotalInteger), sqft: num(p.LivingArea),
    property_type: str(p.PropertySubType || p.PropertyType, 60), remarks: str(p.PublicRemarks, 1200),
    photos, list_office: str(p.ListOfficeName, 120), list_agent: str(p.ListAgentFullName, 120),
    lat: p.Latitude ?? null, lng: p.Longitude ?? null, url: null, modified_at: p.ModificationTimestamp || null,
  };
}

async function fetchBridge() {
  const cities = L().cities.map((c) => `City eq '${c.replace(/'/g, "''")}'`).join(" or ");
  const filter = `StandardStatus eq 'Active' and InternetEntireListingDisplayYN eq true and PropertyType eq 'Residential'${cities ? ` and (${cities})` : ""}`;
  let url = `${L().bridgeBase}/${encodeURIComponent(L().bridgeDataset)}/Property?$filter=${encodeURIComponent(filter)}&$select=${SELECT}&$orderby=${encodeURIComponent("ModificationTimestamp desc")}&$top=50`;
  const out = [];
  for (let page = 0; url && out.length < L().max && page < 5; page++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${L().bridgeToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Bridge API ${r.status}: ${j.error?.message || j.message || r.statusText}`);
    out.push(...(j.value || []).map(mapReso));
    url = j["@odata.nextLink"] || null;
  }
  return out.slice(0, L().max);
}

// ---------------------------------------------------------------- Stellar MLS (MLS Grid, RESO)
// MLS Grid only filters on a few fields (system, status, MlgCanView, ModificationTimestamp), so the
// residential / city / IDX filtering happens here. Pulls the most recently changed active rows.
async function fetchMlsGrid() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().replace(/\.\d+Z$/, "Z");
  const filter = `OriginatingSystemName eq '${L().mlsgridSystem}' and StandardStatus eq 'Active' and MlgCanView eq true and ModificationTimestamp gt ${since}`;
  let url = `${L().mlsgridBase}/Property?$filter=${encodeURIComponent(filter)}&$expand=Media&$top=500`;
  const want = new Set(L().cities.map((c) => c.toLowerCase())), out = [];
  for (let page = 0; url && out.length < L().max && page < 10; page++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${mlsgridToken()}`, Accept: "application/json", "Accept-Encoding": "gzip" }, signal: AbortSignal.timeout(30_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`MLS Grid ${r.status}: ${j.error?.message || j.message || r.statusText}`);
    for (const p of j.value || []) {
      const idx = !Array.isArray(p.MlgCanUse) || p.MlgCanUse.includes("IDX");
      if (!idx || p.MlgCanView === false || (p.PropertyType && p.PropertyType !== "Residential")) continue;
      if (want.size && !want.has(String(p.City || "").toLowerCase())) continue;
      out.push({ ...mapReso(p), id: `mlsgrid:${p.ListingKey || p.ListingId}`, source: "mlsgrid" });
    }
    url = j["@odata.nextLink"] || null;
  }
  return out.slice(0, L().max);
}

// ---------------------------------------------------------------- RealtyAPI (opt-in, non-MLS)
function findArray(j) {
  if (Array.isArray(j)) return j;
  for (const k of ["results", "searchResults", "listResults", "props", "listings", "data", "homes"]) {
    const v = j?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") { const a = findArray(v); if (a.length) return a; }
  }
  return [];
}
export function mapRealty(x) {
  const h = x.property || x.hdpData?.homeInfo || x;
  const addr = x.address && typeof x.address === "object" ? x.address : {};
  const street = str(h.streetAddress || addr.streetAddress || (typeof x.address === "string" ? x.address.split(",")[0] : ""));
  const city = str(h.city || addr.city || x.addressCity, 80), zip = str(h.zipcode || addr.zipcode || x.addressZipcode, 10);
  const photo = x.imgSrc || h.imgSrc || x.image || (x.photos && x.photos[0]) || (x.carouselPhotos && x.carouselPhotos[0]?.url) || null;
  const id = x.zpid || h.zpid || x.id;
  return {
    id: `realty:${id}`, source: "realtyapi", mls_number: "", status: "active",
    price: num(x.unformattedPrice ?? x.price ?? h.price), address: street, city, state: str(h.state || addr.state || x.addressState, 4) || "FL", zip,
    beds: num(x.beds ?? h.bedrooms), baths: num(x.baths ?? h.bathrooms), sqft: num(x.area ?? x.livingArea ?? h.livingArea),
    property_type: str(h.homeType || x.homeType || "", 60).replace(/_/g, " ").toLowerCase(), remarks: "",
    photos: photo ? [photo] : [], list_office: str(x.brokerName || h.brokerName || x.listingBrokerName, 120), list_agent: "",
    lat: h.latitude ?? x.latLong?.latitude ?? null, lng: h.longitude ?? x.latLong?.longitude ?? null,
    url: x.detailUrl ? (/^https?:/.test(x.detailUrl) ? x.detailUrl : `https://www.zillow.com${x.detailUrl}`) : null, modified_at: null,
    _ok: !!(id && street && photo && num(x.unformattedPrice ?? x.price ?? h.price)),
  };
}
async function fetchRealty() {
  const out = [];
  for (const c of L().cities.slice(0, 4)) { // free tier: keep requests low
    const loc = /,/.test(c) ? c : `${c}, FL`;
    const r = await fetch(`${L().realtyBase}/search/bylocation?location=${encodeURIComponent(loc)}&status=forSale&perPage=20`, { headers: { "x-realtyapi-key": L().realtyKey }, signal: AbortSignal.timeout(20_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`RealtyAPI ${r.status}: ${j.message || j.error || r.statusText}`);
    out.push(...findArray(j).map(mapRealty).filter((x) => x._ok));
  }
  const seen = new Set();
  return out.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, L().max).map(({ _ok, ...x }) => x);
}

// ---------------------------------------------------------------- sync + read
export async function syncListings() {
  const source = listingSource();
  if (!source) return { ok: false, source: null, reason: "No MLS feed connected yet (MLSGRID_ACCESS_TOKEN or BRIDGE_API_SERVER_TOKEN)." };
  const rows = source === "mlsgrid" ? await fetchMlsGrid() : source === "stellar-mls" ? await fetchBridge() : await fetchRealty();
  const now = new Date().toISOString();
  for (const r of rows) await db.upsert("mls_listings", { ...r, synced_at: now });
  // anything from this source that wasn't in the feed is no longer active
  const old = await db.select("mls_listings", { source, status: "active" }).catch(() => []);
  const keep = new Set(rows.map((r) => r.id));
  for (const o of old) if (!keep.has(o.id)) await db.update("mls_listings", { id: o.id }, { status: "inactive", synced_at: now });
  const result = { ok: true, source, synced: rows.length, at: now };
  await setSetting("listings_last_sync", result);
  return result;
}

export async function syncListingsIfStale(maxAgeMs = 60 * 60_000) {
  const last = await getSetting("listings_last_sync");
  if (last?.at && Date.now() - new Date(last.at) < maxAgeMs) return { skipped: true, last };
  return syncListings().catch((e) => ({ ok: false, error: e.message }));
}

export const ATTRIBUTION = {
  mlsgrid: "Listing data provided by Stellar MLS through MLS Grid. Information is deemed reliable but not guaranteed. Listings marked with a brokerage name are listed by that brokerage, not necessarily by Bridges Global / LPT Realty.",
  "stellar-mls": "Listing data provided by Stellar MLS through Bridge Interactive. Information is deemed reliable but not guaranteed. Listings marked with a brokerage name are listed by that brokerage, not necessarily by Bridges Global / LPT Realty.",
  realtyapi: "Listing information from public listing sources. Deemed reliable but not guaranteed — verify with the listing brokerage. Listings may be listed by other brokerages.",
};

export async function publicListings({ limit = 12, city } = {}) {
  const allowed = new Set(["mlsgrid", "stellar-mls", ...(L().allowNonMls ? ["realtyapi"] : [])]);
  let rows = (await db.select("mls_listings", { status: "active" }).catch(() => [])).filter((r) => allowed.has(r.source));
  if (city) rows = rows.filter((r) => r.city?.toLowerCase() === String(city).toLowerCase());
  rows = rows.filter((r) => r.price && r.address && (r.photos || []).length)
    .sort((a, b) => String(b.modified_at || b.synced_at || "").localeCompare(String(a.modified_at || a.synced_at || "")));
  const source = rows[0]?.source || listingSource();
  return {
    listings: rows.slice(0, Math.min(Number(limit) || 12, 60)).map((r) => ({
      id: r.id, price: Number(r.price), address: r.address, city: r.city, state: r.state, zip: r.zip,
      beds: r.beds, baths: r.baths, sqft: r.sqft, type: r.property_type, photo: (r.photos || [])[0], photos: (r.photos || []).slice(0, 8),
      remarks: r.remarks, listOffice: r.list_office, mlsNumber: r.mls_number, url: r.url,
    })),
    source, attribution: source ? ATTRIBUTION[source] : null, searchUrl: L().searchUrl,
  };
}
