// Seed catalog for Bridges Live — verticals, orgs, host, listings, shows, streams.
// Deterministic UUIDs so seeding is idempotent (safe to re-run against Supabase).
import crypto from "node:crypto";

export function sid(name) {
  const h = crypto.createHash("sha1").update("bridges-live:" + name).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Public test HLS feed (Mux) — lets the player be tested before a real camera is connected.
export const DEMO_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export const VERTICALS = [
  { id: sid("v:real-estate"), slug: "real-estate", name: "Real Estate", compliance_rules: { license_required: true, escrow_required: true, holds_require_broker_signoff: true } },
  { id: sid("v:matcha"), slug: "matcha", name: "Bridges Matcha", compliance_rules: { license_required: false, escrow_required: false } },
  { id: sid("v:global-trade"), slug: "global-trade", name: "Global Trade", compliance_rules: { license_required: false, escrow_required: false, checkout: "rfq" } },
  { id: sid("v:nonprofit-housing"), slug: "nonprofit-housing", name: "Nonprofit Housing (501c3)", compliance_rules: { nonprofit: true, commercial_routing: false } },
];
const V = Object.fromEntries(VERTICALS.map((v) => [v.slug, v.id]));

const ORG_NAMES = ["Bridges Global", "Emerald Living", "Waterset Living", "Bridges TX", "Skyline Res.", "Triple Creek Homes", "NRR Homes", "Dorota M.", "Bridges Matcha"];
export const ORGS = ORG_NAMES.map((name) => ({
  id: sid("org:" + name),
  vertical_id: name === "Bridges Matcha" ? V.matcha : V["real-estate"],
  name,
  plan: name === "Bridges Matcha" ? "merchant" : "brokerage",
  sponsoring_broker: name === "Bridges Matcha" ? null : "LPT Realty",
}));
const ORG = Object.fromEntries(ORGS.map((o) => [o.name, o.id]));

export const USERS = [
  { id: sid("user:dorota"), org_id: ORG["Bridges Global"], email: "dd@bridgesglobal.co", full_name: "Dorota Maslowska", role: "listing_broker" },
];
const HOST = USERS[0].id;

const IMG = {
  a: "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80",
  b: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
  c: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
  d: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80",
  e: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
  f: "https://images.unsplash.com/photo-1449844908441-8829872d2607?auto=format&fit=crop&w=800&q=80",
  g: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80",
  h: "https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=800&q=80",
};

// [org, title, priceLabel, category code, category label, location, image, baseline viewers, likes]
const PROPERTY_STREAMS = [
  ["Emerald Living", "Triple Creek — Model B", "From the $340s", "new", "New Construction", "Riverview, FL", IMG.a, 343, 4758],
  ["Waterset Living", "Waterfront Estate — Apollo Beach", "$1.2M", "lux", "Luxury", "Apollo Beach, FL", IMG.b, 282, 5425],
  ["Bridges TX", "Channelside Bay Lofts", "From $1,950/mo", "apt", "Apartments", "Downtown Tampa, FL", IMG.c, 280, 2424],
  ["Emerald Living", "North River Ranch", "From the $330s", "new", "New Construction", "Parrish, FL", IMG.d, 407, 4152],
  ["Skyline Res.", "Relocation Tour — Wesley Chapel", "Buyer tour", "reloc", "Relocation", "Wesley Chapel, FL", IMG.e, 367, 1533],
  ["Bridges TX", "Downtown Penthouse", "$895K", "tx", "Texas", "Austin, TX", IMG.b, 514, 4585],
  ["Triple Creek Homes", "Bexley New Homes", "From the $400s", "new", "New Construction", "Land O' Lakes, FL", IMG.b, 437, 824],
  ["NRR Homes", "Epperson Lagoon", "From the $390s", "new", "New Construction", "Wesley Chapel, FL", IMG.d, 439, 554],
  ["Waterset Living", "Emerald Luxury Apartments", "From $1,499/mo", "apt", "Apartments", "Tampa, FL", IMG.f, 408, 3475],
  ["Triple Creek Homes", "SoHo District Residences", "From $1,795/mo", "apt", "Apartments", "Tampa, FL", IMG.e, 450, 5026],
  ["NRR Homes", "Waterset Lakeside", "From $1,450/mo", "apt", "Apartments", "Apollo Beach, FL", IMG.d, 89, 593],
  ["Emerald Living", "SouthShore Bay Lagoon", "From the $320s", "new", "New Construction", "Wimauma, FL", IMG.g, 172, 5805],
  ["Skyline Res.", "Lakewood Ranch Estate", "$785K", "lux", "Luxury", "Lakewood Ranch, FL", IMG.f, 299, 3461],
  ["Waterset Living", "Clearwater Beach Condo", "$640K", "lux", "Luxury", "Clearwater, FL", IMG.g, 158, 3058],
  ["Waterset Living", "Sarasota Bayfront", "$1.4M", "lux", "Luxury", "Sarasota, FL", IMG.a, 383, 5998],
  ["Waterset Living", "Sun City Center Villa", "From the $270s", "new", "New Construction", "Sun City Center, FL", IMG.h, 503, 4985],
  ["Triple Creek Homes", "Brandon Family Home", "$425K", "new", "New Construction", "Brandon, FL", IMG.g, 375, 2029],
  ["Dorota M.", "FishHawk Ranch Tour", "$510K", "new", "New Construction", "Lithia, FL", IMG.h, 72, 4248],
  ["NRR Homes", "Ruskin New Build", "From the $310s", "new", "New Construction", "Ruskin, FL", IMG.e, 449, 845],
  ["Dorota M.", "Ybor City Lofts", "From $1,650/mo", "apt", "Apartments", "Ybor City, FL", IMG.h, 190, 3799],
  ["Dorota M.", "Westshore Marina Club", "From $1,875/mo", "apt", "Apartments", "Tampa, FL", IMG.f, 349, 5334],
  ["Triple Creek Homes", "Skyline Residences", "From $1,495/mo", "apt", "Apartments", "Tampa, FL", IMG.g, 340, 3011],
  ["Waterset Living", "Hyde Park Luxury", "$2,100/mo", "apt", "Apartments", "Hyde Park, Tampa", IMG.b, 160, 595],
  ["Dorota M.", "Bradenton Riverfront", "$389K", "new", "New Construction", "Bradenton, FL", IMG.b, 95, 5213],
  ["Emerald Living", "Wiregrass Grand Opening", "From the $380s", "new", "New Construction", "Wesley Chapel, FL", IMG.e, 248, 2688],
  ["Triple Creek Homes", "Union Park Collection", "From the $385s", "new", "New Construction", "Wesley Chapel, FL", IMG.a, 61, 3083],
];

// The matcha product — price is authoritative HERE (server side), never from the client.
export const MATCHA_PRODUCT = {
  id: "prod_matcha_30",
  name: "Ceremonial Matcha 30g (Uji, Kyoto)",
  price: 30.0,
  currency: "USD",
  addons: [
    { id: "whisk", name: "Bamboo whisk", price: 18.0 },
    { id: "bowl", name: "Chawan bowl", price: 24.0 },
    { id: "tin", name: "Gift tin", price: 8.0 },
  ],
};

// Property "reserve hold" terms — a PayPal AUTHORIZATION (funds held, not captured).
export const HOLD_TERMS = { amount: 500.0, currency: "USD", label: "$500 refundable hold" };

export const LISTINGS = [];
export const SHOWS = [];
export const SHOW_LISTINGS = [];
export const STREAMS = [];

PROPERTY_STREAMS.forEach(([org, title, price, cat, catLabel, location, img, viewers, likes], i) => {
  const key = "p:" + title;
  const listingId = sid("listing:" + key);
  const showId = sid("show:" + key);
  LISTINGS.push({
    id: listingId, org_id: ORG[org], vertical_id: V["real-estate"], title, status: "active",
    attributes: { kind: "property", price_label: price, location, image: img, hold: HOLD_TERMS },
  });
  SHOWS.push({ id: showId, host_id: HOST, org_id: ORG[org], vertical_id: V["real-estate"], title, category: cat, status: "live" });
  SHOW_LISTINGS.push({ show_id: showId, listing_id: listingId });
  STREAMS.push({
    id: sid("stream:" + key), show_id: showId, provider: "youtube", room_id: "room-" + (i + 1),
    playback_url: i === 0 ? DEMO_HLS : null, status: "live", viewer_count: viewers,
    meta: { host_name: org, category: cat, category_label: catLabel, likes, thumbnail: img, cta: "showing" },
  });
});

// Matcha pilot stream (first-class: same engine, instant checkout)
{
  const listingId = sid("listing:matcha");
  const showId = sid("show:matcha");
  LISTINGS.push({
    id: listingId, org_id: ORG["Bridges Matcha"], vertical_id: V.matcha, title: "Bridges Matcha — Ceremonial Tasting", status: "active",
    attributes: { kind: "product", product: MATCHA_PRODUCT, price_label: "$30 · Buy now", location: "Uji, Kyoto", image: "/assets/img/matcha.jpg" },
  });
  SHOWS.push({ id: showId, host_id: HOST, org_id: ORG["Bridges Matcha"], vertical_id: V.matcha, title: "Bridges Matcha — Live Ceremonial Tasting", category: "commerce", status: "live" });
  SHOW_LISTINGS.push({ show_id: showId, listing_id: listingId });
  STREAMS.unshift({
    id: sid("stream:matcha"), show_id: showId, provider: "hls", room_id: "room-matcha",
    playback_url: DEMO_HLS, status: "live", viewer_count: 210,
    meta: { host_name: "Bridges Matcha", category: "commerce", category_label: "Live Commerce", likes: 1890, thumbnail: "/assets/img/matcha.jpg", cta: "buy" },
  });
}

export const MATCHA_STREAM_ID = sid("stream:matcha");
