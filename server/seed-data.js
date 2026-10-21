// Seed catalog for Bridges Live — verticals, the Bridges Global organization and Dorota's user.
// No listings or streams are seeded: everything on the site comes from real streams, real
// social videos and the real listing feed.
// Deterministic UUIDs so seeding is idempotent (safe to re-run against Supabase).
import crypto from "node:crypto";

export function sid(name) {
  const h = crypto.createHash("sha1").update("bridges-live:" + name).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const VERTICALS = [
  { id: sid("v:real-estate"), slug: "real-estate", name: "Real Estate", compliance_rules: { license_required: true, escrow_required: true, holds_require_broker_signoff: true } },
  { id: sid("v:nonprofit-housing"), slug: "nonprofit-housing", name: "Nonprofit Housing (501c3)", compliance_rules: { nonprofit: true, commercial_routing: false } },
];
const V = Object.fromEntries(VERTICALS.map((v) => [v.slug, v.id]));

const ORG_NAMES = ["Bridges Global"];
export const ORGS = ORG_NAMES.map((name) => ({
  id: sid("org:" + name),
  vertical_id: V["real-estate"],
  name,
  plan: "brokerage",
  sponsoring_broker: "LPT Realty",
}));
const ORG = Object.fromEntries(ORGS.map((o) => [o.name, o.id]));

export const USERS = [
  { id: sid("user:dorota"), org_id: ORG["Bridges Global"], email: "dd@bridgesglobal.co", full_name: "Dorota Maslowska", role: "listing_broker" },
];

export const LISTINGS = [];
export const SHOWS = [];
export const SHOW_LISTINGS = [];
export const STREAMS = [];
