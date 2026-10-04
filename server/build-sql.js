// Generates backend/sql/seed.sql from server/seed-data.js (for pasting into the Supabase SQL editor).
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { seedSql } from "./seed-sql.js";

const out = path.join(config.root, "backend", "sql", "seed.sql");
fs.writeFileSync(out, seedSql());
console.log("wrote", path.relative(config.root, out));
