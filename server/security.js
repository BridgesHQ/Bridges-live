// Privacy check: reads private tables with the PUBLIC key (the one every web page carries), exactly as an
// outsider would. With Row Level Security on, every read comes back empty or refused. Any row = exposed.
import { config } from "./config.js";

export const PRIVATE_TABLES = ["leads", "appointments", "engagements", "lead_events", "lead_followups", "audit_logs", "users", "orders", "transactions", "settings"];

export async function publicReadProbe() {
  const { url, publicKey } = config.supabase;
  if (!url || !publicKey) return { ok: null, exposed: [], detail: "Supabase isn't connected yet — nothing to check." };
  const exposed = [];
  await Promise.all(PRIVATE_TABLES.map(async (t) => {
    try {
      const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return; // 401/403/404 → refused, which is what we want
      const rows = await r.json().catch(() => []);
      if (Array.isArray(rows) && rows.length) exposed.push(t);
    } catch { /* unreachable → not exposed through this key */ }
  }));
  exposed.sort();
  return exposed.length
    ? { ok: false, exposed, detail: `The public key can READ: ${exposed.join(", ")}. Run backend/sql/migrations/007_security_lockdown.sql in Supabase now.` }
    : { ok: true, exposed, detail: `The public key can't read any private table (${PRIVATE_TABLES.length} checked) — it can only submit a lead.` };
}
