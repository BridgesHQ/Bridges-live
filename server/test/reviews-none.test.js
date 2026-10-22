// With no Yelp key and no owner-entered figures, no rating is shown and no rating schema is emitted.
import { test } from "node:test";
import assert from "node:assert/strict";

test("no real Yelp figures → no badge data, no AggregateRating", async () => {
  Object.assign(process.env, { YELP_API_KEY: "", YELP_RATING: "", YELP_REVIEW_COUNT: "" });
  const m = await import("../reviews.js");
  assert.equal((await m.yelpRating()).rating, null);
  assert.equal(await m.ratingJsonLd(), "");
});
