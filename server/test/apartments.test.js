import { test } from "node:test";
import assert from "node:assert/strict";
import { mapApartment } from "../apartments/search.js";

test("apartment mapping keeps real fields and leaves missing ones empty", () => {
  const a = mapApartment({ listingKey: "k1", name: "The Harbor", oneLineAddress: "1 Main St, Tampa, FL", rentRange: "$1,650 - $2,900", bedRange: "Studio - 2 Beds",
    amenityNames: ["Pool", "Fitness Center"], primaryImage: "https://x/y.jpg", rentDeals: 1 }, "Tampa");
  assert.equal(a.id, "k1");
  assert.equal(a.rentMin, 1650);
  assert.equal(a.bedMin, 0);
  assert.equal(a.sqftMin, null); // not in the feed → not invented
  assert.equal(a.bathMin, null);
  assert.deepEqual(a.plans, []);
  assert.equal(a.deal, "1 move-in special");
});

test("floor plans map beds, baths, square feet and rent when the feed sends them", () => {
  const a = mapApartment({ name: "X", floorPlans: [{ name: "A1", bedrooms: 1, bathrooms: 1, squareFeet: 720, rent: 1700 }] }, "Tampa");
  assert.deepEqual(a.plans[0], { name: "A1", beds: 1, baths: 1, sqft: 720, rent: 1700, available: "" });
});
