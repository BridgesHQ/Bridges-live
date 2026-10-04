// Finds public Reddit posts from people planning a move to Tampa Bay and stores them as
// *prospects* (not leads): they never opted in, so nothing is sent to them automatically —
// you read the post and reply personally on Reddit.
// Uses Reddit's public JSON search (free, no key). Run: npm run prospects:reddit
import { db } from "../db.js";

export const QUERIES = [
  '"moving to Tampa"', '"relocating to Tampa"', '"move to Tampa"', '"moving to St Pete"', '"moving to St Petersburg FL"',
  '"moving to Sarasota"', '"moving to Wesley Chapel"', '"moving to Riverview FL"', '"relocating to Florida" Tampa',
  '"moving to Lakewood Ranch"', '"moving to Brandon FL"', '"moving to Clearwater"',
];
const UA = "BridgesGlobal-prospect-finder/1.0 (contact: dd@bridgesglobal.co)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scanReddit({ queries = QUERIES, maxAgeDays = 14, fetchImpl = fetch } = {}) {
  let found = 0, added = 0;
  const errors = [];
  for (const q of queries) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=month&limit=25&type=link`;
    try {
      const r = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`reddit ${r.status}`);
      const j = await r.json();
      for (const { data: p } of j?.data?.children || []) {
        if (!p?.id || p.over_18 || p.author === "[deleted]") continue;
        if (Date.now() / 1000 - p.created_utc > maxAgeDays * 86400) continue;
        found++;
        const exists = await db.select("prospects", { platform: "reddit", external_id: p.id }).catch(() => []);
        if (exists.length) continue;
        await db.insert("prospects", {
          platform: "reddit", external_id: p.id, author: p.author, title: String(p.title || "").slice(0, 300),
          body: String(p.selftext || "").slice(0, 2000), url: `https://www.reddit.com${p.permalink}`, community: `r/${p.subreddit}`,
          matched_query: q, posted_at: new Date(p.created_utc * 1000).toISOString(), status: "new",
        });
        added++;
      }
    } catch (e) { errors.push(`${q}: ${e.message}`); }
    await sleep(1500); // stay well under Reddit's unauthenticated rate limit
  }
  return { found, added, errors };
}

if (process.argv[1] && process.argv[1].endsWith("reddit.js")) {
  scanReddit().then((r) => { console.log(r); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
}
