// Runs schema.sql → migrations/*.sql → seed against Supabase Postgres.
//   DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres npm run db:migrate
// (Supabase dashboard → Project Settings → Database → Connection string → "Session pooler".)
// No DATABASE_URL? Paste backend/sql/supabase_setup.sql into the Supabase SQL editor instead.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { config } from "./config.js";
import { seedSql } from "./seed-sql.js";

const sqlDir = path.join(config.root, "backend", "sql");
export function files() {
  const migrations = fs.readdirSync(path.join(sqlDir, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  return [
    ["schema.sql", fs.readFileSync(path.join(sqlDir, "schema.sql"), "utf8")],
    ...migrations.map((f) => [`migrations/${f}`, fs.readFileSync(path.join(sqlDir, "migrations", f), "utf8")]),
    ["seed", seedSql()],
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv.includes("--print")) {
    const out = path.join(sqlDir, "supabase_setup.sql");
    fs.writeFileSync(out, files().map(([n, s]) => `-- >>>>>>>>>> ${n}\n${s}`).join("\n\n"));
    console.log("wrote", path.relative(config.root, out));
    process.exit(0);
  }
  if (!config.supabase.databaseUrl) {
    console.error("DATABASE_URL is not set. Either set it in .env, or paste backend/sql/supabase_setup.sql into the Supabase SQL editor.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: config.supabase.databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const [name, sql] of files()) {
      process.stdout.write(`→ ${name} … `);
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("ok");
    }
    const { rows } = await client.query("select slug from verticals order by slug");
    console.log("verticals:", rows.map((r) => r.slug).join(", "));
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error("\nfailed:", e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
