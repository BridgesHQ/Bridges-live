// Data layer. Uses Supabase (service-role key, server-side only) when configured;
// otherwise a local JSON file (data/local-db.json) with the same table shapes, so the
// whole platform runs locally before any keys exist.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import * as seed from "./seed-data.js";

const now = () => new Date().toISOString();

function matches(row, match = {}) {
  return Object.entries(match).every(([k, v]) => (Array.isArray(v) ? v.includes(row[k]) : row[k] === v));
}

// ---------------------------------------------------------------- local store
class LocalStore {
  constructor(file) {
    this.kind = "local";
    this.file = file;
    this.data = {};
    if (fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { this.data = {}; }
    }
    if (!this.data.streams) this.seed();
  }
  seed() {
    const t = (rows) => rows.map((r) => ({ created_at: now(), ...structuredClone(r) }));
    this.data = {
      verticals: t(seed.VERTICALS), organizations: t(seed.ORGS), users: t(seed.USERS),
      listings: t(seed.LISTINGS), shows: t(seed.SHOWS), show_listings: t(seed.SHOW_LISTINGS),
      streams: t(seed.STREAMS), chat_messages: [], engagements: [], leads: [], appointments: [],
      orders: [], comment_events: [], audit_logs: [],
    };
    this.flush();
  }
  flush() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1));
    }, 100);
  }
  table(name) { return (this.data[name] ||= []); }
  async select(name, match = {}, { order, desc = true, limit } = {}) {
    let rows = this.table(name).filter((r) => matches(r, match));
    if (order) rows = [...rows].sort((a, b) => (a[order] > b[order] ? 1 : -1) * (desc ? -1 : 1));
    if (limit) rows = rows.slice(0, limit);
    return structuredClone(rows);
  }
  async insert(name, row) {
    const r = { id: crypto.randomUUID(), created_at: now(), ...row };
    this.table(name).push(r);
    this.flush();
    return structuredClone(r);
  }
  async update(name, match, patch) {
    const out = [];
    for (const r of this.table(name)) if (matches(r, match)) { Object.assign(r, patch); out.push(structuredClone(r)); }
    if (out.length) this.flush();
    return out;
  }
}

// ------------------------------------------------------------- supabase store
class SupabaseStore {
  constructor(url, key) {
    this.kind = "supabase";
    this.sb = createClient(url, key, { auth: { persistSession: false } });
  }
  _apply(q, match) {
    for (const [k, v] of Object.entries(match)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    return q;
  }
  async select(name, match = {}, { order, desc = true, limit } = {}) {
    let q = this._apply(this.sb.from(name).select("*"), match);
    if (order) q = q.order(order, { ascending: !desc });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw new Error(`${name}.select: ${error.message}`);
    return data;
  }
  async insert(name, row) {
    const { data, error } = await this.sb.from(name).insert(row).select().single();
    if (error) throw new Error(`${name}.insert: ${error.message}`);
    return data;
  }
  async update(name, match, patch) {
    const { data, error } = await this._apply(this.sb.from(name).update(patch), match).select();
    if (error) throw new Error(`${name}.update: ${error.message}`);
    return data;
  }
}

const localFile = process.env.BL_LOCAL_DB || path.join(config.root, "data", "local-db.json");
let store = config.supabase.url && config.supabase.serviceKey
  ? new SupabaseStore(config.supabase.url, config.supabase.serviceKey)
  : new LocalStore(localFile);

/** Delegating handle so the backing store can be swapped (Supabase → local) at startup. */
export const db = {
  get kind() { return store.kind; },
  select: (...a) => store.select(...a),
  insert: (...a) => store.insert(...a),
  update: (...a) => store.update(...a),
};

/**
 * Verify Supabase is reachable and migrated. If not, fall back to the local store so the
 * site keeps working, and explain what to do. Returns a status string for the banner.
 */
export async function checkDatabase() {
  if (store.kind !== "supabase") return "local";
  try {
    const rows = await Promise.race([
      store.select("streams", { status: "live" }, { limit: 1 }),
      new Promise((_, no) => setTimeout(() => no(new Error("timed out after 8s")), 8000)),
    ]);
    if (!rows.length) return "supabase (connected — no live streams yet: run backend/sql/seed.sql)";
    return "supabase";
  } catch (e) {
    const missing = /does not exist|schema cache|relation/i.test(e.message);
    console.warn(`[db] Supabase check failed: ${e.message}`);
    console.warn(missing
      ? "[db] Tables are missing — paste backend/sql/supabase_setup.sql into the Supabase SQL editor (or npm run db:migrate)."
      : "[db] Could not reach Supabase — check SUPABASE_URL / SUPABASE_SERVICE_KEY and your network.");
    if (process.env.REQUIRE_SUPABASE === "true") throw e;
    store = new LocalStore(localFile);
    return "local (FALLBACK — Supabase not ready, see warning above)";
  }
}

// ------------------------------------------------------------- domain queries
let cache = { at: 0, rows: null };
export function invalidateStreams() { cache = { at: 0, rows: null }; }

/** Denormalized live streams for the grid / player (cached 10s). */
export async function listStreams() {
  if (cache.rows && Date.now() - cache.at < 10_000) return cache.rows;
  const [streams, shows, links, listings, orgs, verticals] = await Promise.all([
    db.select("streams", { status: "live" }),
    db.select("shows"), db.select("show_listings"), db.select("listings"),
    db.select("organizations"), db.select("verticals"),
  ]);
  const by = (arr) => Object.fromEntries(arr.map((r) => [r.id, r]));
  const S = by(shows), L = by(listings), O = by(orgs), V = by(verticals);
  const rows = streams.map((st) => {
    const show = S[st.show_id] || {};
    const link = links.find((l) => l.show_id === show.id);
    const item = (link && L[link.listing_id]) || {};
    const attrs = item.attributes || {};
    const meta = st.meta || {};
    const vertical = V[show.vertical_id]?.slug || "real-estate";
    return {
      id: st.id, roomId: st.room_id, showId: show.id, listingId: item.id || null,
      title: item.title || show.title, showTitle: show.title,
      host: meta.host_name || O[show.org_id]?.name || "Bridges Live",
      orgId: show.org_id || null, hostId: show.host_id || null, vertical,
      category: meta.category || show.category, categoryLabel: meta.category_label || show.category,
      priceLabel: attrs.price_label || "", location: attrs.location || "",
      image: meta.thumbnail || attrs.image || null,
      playbackUrl: st.playback_url || null, provider: st.provider,
      baselineViewers: st.viewer_count || 0, likes: meta.likes || 0,
      cta: meta.cta || (attrs.kind === "product" ? "buy" : "showing"),
      product: attrs.product || null, hold: attrs.hold || null,
    };
  });
  // matcha pilot first, then by audience
  rows.sort((a, b) => (b.cta === "buy") - (a.cta === "buy") || b.baselineViewers - a.baselineViewers);
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getStream(id) {
  return (await listStreams()).find((s) => s.id === id || s.roomId === id) || null;
}

/** Insert a lead, tolerating older `leads` tables that lack newer columns. */
export async function insertLead(lead) {
  const base = {
    first_name: lead.first_name, email: lead.email, phone: lead.phone || "",
    market: lead.market || "", stage: lead.stage || "New", priority: lead.priority || "High",
    source: lead.source || "Website", notes: lead.notes || "",
  };
  const extended = { ...base, listing_id: lead.listing_id || null, org_id: lead.org_id || null, host_id: lead.host_id || null, stream_id: lead.stream_id || null, engagement_id: lead.engagement_id || null };
  try { return await db.insert("leads", extended); }
  catch (e) {
    if (db.kind !== "supabase") throw e;
    console.warn("[leads] extended insert failed, retrying with base columns:", e.message);
    return db.insert("leads", base);
  }
}

export async function audit(action, entity, entityId, meta) {
  try { await db.insert("audit_logs", { action, entity, entity_id: entityId || null, meta: meta || {} }); }
  catch (e) { console.warn("[audit]", e.message); }
}
