// Compliance: no page, answer, FAQ or llms.txt line states or implies fees, "free" service, or who pays.
// (Landlord/builder promotions like "free upgrades" are not our fee claims; they're allowed below.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "../site-shell.js";
import { PAGES } from "../seo-content.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BANNED = /no fees?\b|no cost|costs? (you|renters|buyers) nothing|(community|property|builder|owner|landlord)s? (pays?|paying)\b|compensation is paid|paid by (the )?(property|builder|owner|communit)|placement fee|buyer-side commission|at no cost|free (to|for) (you|renters|buyers)|is free to|apartment locating is free|\bfree (apartment locating|home valuation|valuation|consult|tour|guide|relocation guide)\b|\bit'?s free\b/i;
const visible = (html) => html.replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("no fee / free / who-pays claims on any public page (text, meta and JSON-LD)", () => {
  for (const p of pages()) {
    const html = fs.readFileSync(path.join(ROOT, p), "utf8");
    const metas = [...html.matchAll(/(?:content|title|alt)="([^"]*)"/g)].map((m) => m[1]).join(" ");
    const m = (visible(html) + " " + metas).match(BANNED);
    assert.equal(m, null, `${p}: "${m && m[0]}"`);
  }
});

test("answers, FAQs and llms.txt are free of fee claims too", () => {
  assert.doesNotMatch(JSON.stringify(PAGES), BANNED);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "llms.txt"), "utf8"), BANNED);
});
