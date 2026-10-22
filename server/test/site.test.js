// Site shell + answer-engine content: idempotent stamping, 40–60 word answers, valid JSON-LD,
// AI crawlers allowed, llms.txt present, ministry line in every footer, no reserve hold anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stamp, pages } from "../site-shell.js";
import { PAGES, words } from "../seo-content.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("every page is already stamped (run npm run site:shell after editing the shell)", () => {
  for (const p of pages()) assert.equal(stamp(read(p), p), read(p), p);
});

test("key pages lead with a 40–60 word answer and carry FAQPage JSON-LD", () => {
  for (const [p, c] of Object.entries(PAGES)) {
    const n = words(c.answer);
    assert.ok(n >= 40 && n <= 60, `${p}: ${n} words`);
    const html = read(p);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocks.some((b) => b["@type"] === "FAQPage" && b.mainEntity.length === c.faqs.length), p);
    assert.match(html, /class="bx-answer"/, p);
  }
  const home = read("index.html");
  assert.match(home, /"@type":\["Person"\]/); assert.match(home, /"@type":"RealEstateAgent"/);
});

test("robots.txt welcomes search + AI crawlers; llms.txt exists", () => {
  const r = read("robots.txt");
  for (const bot of ["GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Googlebot", "Bingbot"]) assert.match(r, new RegExp(`User-agent: ${bot}\\nAllow: /`), bot);
  assert.match(r, /Sitemap: https:\/\/live\.bridgesglobal\.co\/sitemap\.xml/);
  assert.match(read("llms.txt"), /^# Bridges Global/);
});

test("Gift of God Ministries line in every footer; no reserve hold anywhere", () => {
  for (const p of pages()) {
    const html = read(p);
    assert.match(html, /A portion of every Bridges transaction supports Gift of God Ministries &mdash; a 501\(c\)\(3\) nonprofit providing housing education, relocation resources, and support to families in need across our communities\. Wisdom builds\. Bridges connect\./, p);
    assert.match(html, /giftofgodministries\.org\/housing-ministry\//, p);
    assert.doesNotMatch(html, /reserve (a )?hold|\$500 refundable/i, p);
  }
});
