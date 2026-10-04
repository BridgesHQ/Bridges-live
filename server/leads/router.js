// One pipeline for every lead — site forms, live-show viewers, showing/hold modals, Go Live:
// save to Supabase → instant SMS + email to the agent → CRM → 5-touch follow-up.
import { config } from "../config.js";
import { db, insertLead } from "../db.js";
import { sendEmail, sendSms, syncCrm } from "./providers.js";
import { enqueueSequence, isUnsubscribed } from "./sequence.js";

const clean = (s, n = 200) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const PLACEHOLDER_EMAIL = /^noemail@/i;
const DEDUPE_MS = 12 * 3600_000;

/** US-centric E.164 normalisation: (813) 555-1234 → +18135551234; keeps +country numbers. */
export function toE164(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

export function normalizeLead(b) {
  const email = clean(b.email, 120).toLowerCase();
  const utm = b.utm && typeof b.utm === "object"
    ? Object.fromEntries(Object.entries(b.utm).filter(([k]) => /^(utm_\w+|fbclid|gclid)$/.test(k)).map(([k, v]) => [k, clean(v, 120)]))
    : {};
  return {
    first_name: clean(b.first_name || b.name, 80),
    email: PLACEHOLDER_EMAIL.test(email) ? "" : email,
    phone: clean(b.phone, 40),
    phone_e164: toE164(b.phone),
    market: clean(b.market, 160),
    source: clean(b.source, 160) || "Website",
    notes: clean(b.notes, 4000),
    stage: "New", priority: clean(b.priority, 20) || "High",
    page_url: clean(b.page_url, 300),
    utm,
    sms_consent: b.sms_consent === true,
    stream_id: b.stream_id || null, listing_id: b.listing_id || null, org_id: b.org_id || null,
    host_id: b.host_id || null, engagement_id: b.engagement_id || null,
  };
}

async function log(lead, type, r) {
  try {
    await db.insert("lead_events", { lead_ref: lead.id != null ? String(lead.id) : null, email: lead.email || null, type,
      status: r.status, detail: clean(r.detail, 500) });
  } catch (e) { console.warn("[lead_events]", e.message); }
}

function alertText(l, isUpdate) {
  const who = [l.first_name, l.phone, l.email].filter(Boolean).join(" · ");
  return `${isUpdate ? "🔁 Lead update" : "🔔 New lead"}: ${who}\n${l.source}${l.market ? ` — ${l.market}` : ""}${l.notes ? `\n"${l.notes.slice(0, 220)}"` : ""}`;
}

function alertEmail(l, isUpdate) {
  const rows = [["Name", l.first_name], ["Email", l.email && `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>`], ["Phone", l.phone && `<a href="tel:${esc(l.phone_e164 || l.phone)}">${esc(l.phone)}</a>`],
    ["Source", esc(l.source)], ["Interest", esc(l.market)], ["Notes", esc(l.notes).replace(/\n/g, "<br>")], ["Page", l.page_url && `<a href="${esc(l.page_url)}">${esc(l.page_url)}</a>`],
    ["Campaign", esc(Object.entries(l.utm || {}).map(([k, v]) => `${k}=${v}`).join(" "))], ["Texts OK", l.sms_consent ? "yes" : "no"]]
    .filter(([, v]) => v);
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px"><h2 style="color:#0E1E52;margin:0 0 12px">${isUpdate ? "Lead update" : "New lead"} — ${esc(l.first_name || l.email || "website visitor")}</h2>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#777;vertical-align:top">${k}</td><td>${typeof v === "string" && v.startsWith("<") ? v : esc(v)}</td></tr>`).join("")}</table>
<p>${l.phone_e164 ? `<a href="tel:${esc(l.phone_e164)}">Call</a> · <a href="sms:${esc(l.phone_e164)}">Text</a> · ` : ""}${l.email ? `<a href="mailto:${esc(l.email)}">Email</a> · ` : ""}<a href="${esc(config.appUrl)}/admin">Open admin</a></p></div>`;
  return { subject: `${isUpdate ? "Lead update" : "🔔 New lead"}: ${l.first_name || l.email} — ${l.source}`, html, text: alertText(l, isUpdate) };
}

/**
 * Routes one lead. Always saves first (a lead is never lost because an integration is down),
 * then alerts / CRM / sequence in parallel. Returns a per-channel delivery report.
 */
export async function routeLead(input, { alert = true } = {}) {
  const l = normalizeLead(input);
  if (!l.first_name && !l.email && !l.phone) throw Object.assign(new Error("Name and email or phone required"), { status: 400 });
  const saved = await insertLead({ ...l, phone: l.phone });
  const lead = { ...l, id: saved?.id ?? null, created_at: saved?.created_at || new Date().toISOString() };

  // same person within 12 h (e.g. chat follow-up notes, double submit) → update, not a new lead
  let isUpdate = false;
  if (lead.email) {
    const prior = await db.select("lead_events", { email: lead.email, type: "routed" }, { order: "created_at", limit: 1 }).catch(() => []);
    isUpdate = !!prior[0] && Date.now() - new Date(prior[0].created_at).getTime() < DEDUPE_MS;
  }
  await log(lead, "routed", { status: isUpdate ? "update" : "new", detail: lead.source });

  const report = { lead_id: lead.id, update: isUpdate };
  const tasks = [];
  if (alert) {
    const a = alertEmail(lead, isUpdate);
    tasks.push(["alert_email", () => sendEmail({ to: config.leads.ownerEmail, subject: a.subject, html: a.html, text: a.text, replyTo: lead.email || undefined })]);
    // no SMS for updates — avoid buzzing your phone twice for the same person
    if (!isUpdate) tasks.push(["alert_sms", () => sendSms(config.leads.ownerPhone, alertText(lead, false))]);
  }
  tasks.push(["crm", async () => {
    const r = await syncCrm(lead);
    return { status: r.some((x) => x.status === "sent") ? "sent" : r.every((x) => x.status === "skipped") ? "skipped" : "failed", detail: r.map((x) => `${x.channel}: ${x.status}${x.detail ? ` (${x.detail})` : ""}`).join("; ") };
  }]);
  if (!isUpdate && lead.email) {
    tasks.push(["sequence", async () => ((await isUnsubscribed(lead.email)) ? { status: "skipped", detail: "unsubscribed" } : enqueueSequence({ ...lead, phone: lead.phone_e164 }))]);
  }
  await Promise.all(tasks.map(async ([name, fn]) => {
    let r;
    try { r = await fn(); } catch (e) { r = { status: "failed", detail: e.message }; }
    report[name] = r.status;
    await log(lead, name, r);
  }));
  // the first follow-up (welcome email) is due now — send it right away instead of waiting a minute
  if (report.sequence === "scheduled") import("./sequence.js").then((m) => m.runDueFollowups()).catch(() => {});
  return report;
}
