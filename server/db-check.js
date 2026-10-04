// npm run db:check — verifies the Supabase connection + that migrations/seed have run.
import { config } from "./config.js";
import { db, checkDatabase } from "./db.js";

if (!config.supabase.url || !config.supabase.serviceKey) {
  console.log("SUPABASE_URL / SUPABASE_SERVICE_KEY not set in .env — using the local store.");
  process.exit(1);
}
process.env.REQUIRE_SUPABASE = "true";
try {
  const status = await checkDatabase();
  console.log("✓ Supabase:", status);
  for (const t of ["verticals", "streams", "leads", "orders", "comment_events"]) {
    const rows = await db.select(t, {}, { limit: 1000 });
    console.log(`  ${t.padEnd(15)} ${rows.length} rows`);
  }
} catch (e) {
  console.error("✗ Supabase not ready:", e.message);
  process.exit(1);
}
