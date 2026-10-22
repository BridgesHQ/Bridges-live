// Stellar MLS via MLS Grid: bearer token, IDX-only rows, city filter, attribution; non-MLS data stays off.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const calls = [];
const row = (k, extra = {}) => ({ ListingKey: k, ListingId: "S" + k, StandardStatus: "Active", ListPrice: 525000, UnparsedAddress: `${k} Gulf Way`, City: "Riverview", StateOrProvince: "FL", PostalCode: "33569",
  BedroomsTotal: 4, BathroomsTotalInteger: 3, LivingArea: 2400, PropertyType: "Residential", ListOfficeName: "Gulf Realty", MlgCanView: true, MlgCanUse: ["IDX", "VOW"],
  ModificationTimestamp: "2026-10-20T10:00:00Z", Media: [{ MediaURL: `https://media.example/${k}.jpg`, Order: 0 }], ...extra });
let srv, sync, pub;
before(async () => {
  srv = http.createServer((req, res) => {
    calls.push({ url: req.url, auth: req.headers.authorization });
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Bearer MLSG-TOKEN") { res.statusCode = 401; return res.end(JSON.stringify({ error: { message: "bad token" } })); }
    res.end(JSON.stringify({ value: [row("1"), row("2", { MlgCanUse: ["VOW"] }), row("3", { City: "Orlando" }), row("4", { PropertyType: "Commercial Sale" }), row("5", { City: "Brandon" })] }));
  }).listen(0);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mlsg-"));
  Object.assign(process.env, { SUPABASE_URL: "", SUPABASE_SERVICE_KEY: "", BL_LOCAL_DB: path.join(dir, "db.json"), MLSGRID_ACCESS_TOKEN: "MLSG-TOKEN",
    MLSGRID_API_BASE: `http://127.0.0.1:${srv.address().port}/v2`, BRIDGE_API_SERVER_TOKEN: "", REALTYAPI_KEY: "rt_x", LISTING_CITIES: "Riverview;Brandon" });
  ({ syncListings: sync, publicListings: pub } = await import("../listings/sync.js"));
});
after(() => srv.close());

test("MLS Grid: IDX residential rows in our cities, with brokerage + MLS attribution", async () => {
  const r = await sync();
  assert.equal(r.source, "mlsgrid");
  assert.equal(calls[0].auth, "Bearer MLSG-TOKEN");
  const q = decodeURIComponent(calls[0].url);
  assert.match(q, /OriginatingSystemName eq 'stellar'/); assert.match(q, /MlgCanView eq true/); assert.match(q, /\$expand=Media/);
  const l = await pub({ limit: 12 });
  assert.deepEqual(l.listings.map((x) => x.mlsNumber).sort(), ["S1", "S5"], "VOW-only, other-city and commercial rows are dropped");
  assert.equal(l.listings[0].listOffice, "Gulf Realty");
  assert.match(l.attribution, /Stellar MLS through MLS Grid/);
});
