// Yelp badge + schema use real figures only: from the Yelp Fusion API (with up to 3 review
// excerpts) — never invented. Without a key or owner-entered numbers, nothing is emitted.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

let srv, m;
before(async () => {
  srv = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== "Bearer YELP-KEY") { res.statusCode = 401; return res.end("{}"); }
    if (req.url.includes("/reviews")) return res.end(JSON.stringify({ reviews: [{ text: "Dorota toured the house live for us.", rating: 5, time_created: "2026-09-01 10:00:00", user: { name: "Ana R." } }] }));
    res.end(JSON.stringify({ rating: 4.5, review_count: 21, url: "https://www.yelp.com/biz/x?utm=1" }));
  }).listen(0);
  Object.assign(process.env, { YELP_API_KEY: "YELP-KEY", YELP_API_BASE: `http://127.0.0.1:${srv.address().port}/v3`, YELP_RATING: "", YELP_REVIEW_COUNT: "" });
  m = await import("../reviews.js");
});
after(() => srv.close());

test("Yelp API → rating, count, review excerpts → AggregateRating + Review JSON-LD", async () => {
  const y = await m.yelpRating();
  assert.equal(y.rating, 4.5); assert.equal(y.count, 21); assert.equal(y.url, "https://www.yelp.com/biz/x");
  const ld = JSON.parse((await m.ratingJsonLd()).replace(/^<script[^>]*>|<\/script>$/g, ""));
  assert.equal(ld.aggregateRating.ratingValue, 4.5); assert.equal(ld.aggregateRating.reviewCount, 21);
  assert.equal(ld.review[0].reviewRating.ratingValue, 5); assert.equal(ld.review[0].author.name, "Ana R.");
});
