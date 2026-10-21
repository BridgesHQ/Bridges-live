// Clear errors instead of silent failures: missing Supabase tables name the migration to run,
// and keys pasted with quotes/spaces still work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("missing Supabase table → tells you which migration to run", async () => {
  const { explainDbError } = await import("../db.js");
  const e = explainDbError(new Error("app_settings.upsert: Could not find the table 'public.app_settings' in the schema cache"));
  assert.match(e.message, /missing the "app_settings" table — run backend\/sql\/migrations\/006_listings_social\.sql/);
  assert.match(explainDbError(new Error('relation "content_posts" does not exist')).message, /005_content_and_cleanup\.sql/);
  const other = new Error("timeout"); assert.equal(explainDbError(other), other);
});

test("API keys pasted with quotes or spaces are cleaned", () => {
  const out = execFileSync(process.execPath, ["-e", "import('./server/config.js').then(m=>console.log(JSON.stringify([m.config.social.youtubeKey,m.config.social.youtubeHandle,m.config.anthropic.key])))"], {
    env: { ...process.env, YOUTUBE_API_KEY: ' "AIzaTEST" ', YOUTUBE_HANDLE: "'BridgesGlobalHQ'", ANTHROPIC_API_KEY: "`sk-ant-x`" }, encoding: "utf8",
  });
  assert.deepEqual(JSON.parse(out.trim().split("\n").pop()), ["AIzaTEST", "@BridgesGlobalHQ", "sk-ant-x"]);
});
