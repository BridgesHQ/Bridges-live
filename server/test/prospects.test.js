import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SUPABASE_URL = "";
process.env.BL_LOCAL_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bl-pr-")), "db.json");
const { scanReddit } = await import("../prospects/reddit.js");
const { db } = await import("../db.js");

const now = Date.now() / 1000;
const post = (id, extra = {}) => ({ data: { id, author: "relo_" + id, title: "Moving to Tampa in spring — which suburbs?", selftext: "Family of 4 from Ohio", permalink: `/r/tampa/comments/${id}/x/`, subreddit: "tampa", created_utc: now - 3600, ...extra } });
const fakeFetch = async () => new Response(JSON.stringify({ data: { children: [post("a1"), post("a2"), post("old", { created_utc: now - 90 * 86400 }), post("nsfw", { over_18: true }), post("del", { author: "[deleted]" })] } }), { status: 200 });

test("Reddit scan stores recent public posts as prospects, once", async () => {
  const r1 = await scanReddit({ queries: ['"moving to Tampa"', '"relocating to Tampa"'], fetchImpl: fakeFetch });
  assert.deepEqual([r1.found, r1.added, r1.errors.length], [4, 2, 0]); // a1,a2 seen by both queries; old/nsfw/deleted skipped
  const rows = await db.select("prospects");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].url, "https://www.reddit.com/r/tampa/comments/a1/x/");
  assert.equal(rows[0].status, "new");
  const r2 = await scanReddit({ queries: ['"moving to Tampa"'], fetchImpl: fakeFetch });
  assert.equal(r2.added, 0, "no duplicates on re-scan");
  // prospects are never put into the auto-follow-up sequence
  assert.equal((await db.select("lead_followups")).length, 0);
});
