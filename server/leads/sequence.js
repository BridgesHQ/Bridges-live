// 5-touch follow-up sequence, sent by email through Resend.
import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../db.js";
import { sendEmail } from "./providers.js";

const DAY = 86_400_000;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const first = (l) => (String(l.first_name || "").trim().split(/\s+/)[0] || "there");

export function unsubscribeToken(email) {
  return crypto.createHmac("sha256", config.leads.unsubscribeSecret).update(String(email).toLowerCase()).digest("base64url").slice(0, 32);
}
export function unsubscribeUrl(email) {
  return `${config.appUrl}/api/unsubscribe?e=${encodeURIComponent(Buffer.from(String(email).toLowerCase()).toString("base64url"))}&t=${unsubscribeToken(email)}`;
}


function layout(l, paragraphs, cta) {
  const site = config.appUrl;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1A1A1A;max-width:560px">
${paragraphs.map((p) => `<p>${p}</p>`).join("\n")}
${cta ? `<p><a href="${esc(cta.href)}" style="display:inline-block;background:#1A5C3A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${esc(cta.label)}</a></p>` : ""}
<p>Dorota Maslowska<br>Broker Associate · Bridges Global<br>(813) 781-8888 · <a href="${esc(site)}">${esc(site.replace(/^https?:\/\//, ""))}</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:12px;color:#777">You're receiving this because you contacted Bridges Global (${esc(l.source || "website")}).
Real estate services provided by LPT Realty · FL BK3519799 · TX 829789-SA · Equal Housing Opportunity.${config.leads.businessAddress ? `<br>${esc(config.leads.businessAddress)}` : ""}
<br><a href="${esc(unsubscribeUrl(l.email))}" style="color:#777">Unsubscribe</a></p></div>`;
  const text = paragraphs.map((p) => p.replace(/<[^>]+>/g, "")).join("\n\n") + (cta ? `\n\n${cta.label}: ${cta.href}` : "")
    + `\n\nDorota Maslowska · Bridges Global · (813) 781-8888\nLPT Realty · FL BK3519799 · Equal Housing Opportunity${config.leads.businessAddress ? `\n${config.leads.businessAddress}` : ""}\nUnsubscribe: ${unsubscribeUrl(l.email)}`;
  return { html, text };
}


const whatsapp = () => (config.leads.whatsappNumber ? { label: "Message me on WhatsApp", href: `https://wa.me/${config.leads.whatsappNumber}` } : null);

/** The five touches (all email). */
export const STEPS = [
  { step: 1, delay: 0, channel: "email",
    subject: (l) => `Got it, ${first(l)} — next steps from Bridges Global`,
    body: (l) => [
      `Hi ${esc(first(l))},`,
      `Thanks for reaching out${l.market ? ` about <b>${esc(l.market)}</b>` : ""}. I personally read every request and I'll be in touch shortly.`,
      `Just reply to this email${config.leads.whatsappNumber ? " or message me on WhatsApp" : ""} with any questions — what you're looking for, your timeline, and your budget range help me send the right options.`,
    ],
    cta: whatsapp },
  { step: 2, delay: 1 * DAY, channel: "email",
    subject: () => `See homes live before you visit`,
    body: (l) => [`Hi ${esc(first(l))},`, `On Bridges Live you can watch real homes and new-construction models on camera, ask questions in the chat, and request a private showing in one tap — from anywhere.`, `Tell me what you'd like to see and I'll schedule a live walkthrough for you.`],
    cta: () => ({ label: "Watch homes live", href: `${config.appUrl}/live-marketplace` }) },
  { step: 3, delay: 3 * DAY, channel: "email",
    subject: () => `Quick question about your timeline`,
    body: (l) => [`Hi ${esc(first(l))},`, `Quick question so I can send you the right options: what's your ideal move-in timeframe, and is there a budget range you'd like me to stay within?`, `Just hit reply — a one-line answer is perfect.`],
    cta: whatsapp },
  { step: 4, delay: 7 * DAY, channel: "email",
    subject: () => `Your free Tampa Bay relocation guide`,
    body: (l) => [`Hi ${esc(first(l))},`, `I put together a free guide to Tampa Bay neighborhoods, new-construction incentives, and what to expect when you move here.`, `If anything in it sparks a question, reply and I'll answer personally.`],
    cta: () => ({ label: "Get the free guide", href: `${config.appUrl}/relocation-guide/` }) },
  { step: 5, delay: 14 * DAY, channel: "email",
    subject: (l) => `Should I keep your file open, ${first(l)}?`,
    body: (l) => [`Hi ${esc(first(l))},`, `I haven't heard back, so I don't want to crowd your inbox. If you're still looking, reply "yes" and I'll keep sending options. If your plans changed, no problem at all — this is my last automatic note.`],
    cta: null },
];

export async function isUnsubscribed(email) {
  const rows = await db.select("lead_unsubscribes", { email: String(email).toLowerCase() }).catch(() => []);
  return rows.length > 0;
}

export async function enqueueSequence(lead) {
  if (!config.leads.sequence || !lead.email) return { status: "skipped", detail: "sequence disabled" };
  const now = Date.now();
  for (const s of STEPS) {
    await db.insert("lead_followups", {
      lead_ref: lead.id != null ? String(lead.id) : null, email: lead.email.toLowerCase(), phone: lead.phone || null,
      first_name: lead.first_name || null, market: lead.market || null, source: lead.source || null,
      sms_consent: !!lead.sms_consent, step: s.step, channel: s.channel, status: "pending",
      send_at: new Date(now + s.delay).toISOString(),
    });
  }
  return { status: "scheduled", detail: `${STEPS.length} touches` };
}

async function deliver(row) {
  const s = STEPS.find((x) => x.step === row.step);
  const l = { first_name: row.first_name, email: row.email, market: row.market, source: row.source, phone: row.phone };
  const { html, text } = layout(l, s.body(l), s.cta && s.cta(l));
  return [await sendEmail({ to: row.email, subject: s.subject(l), html, text,
    headers: { "List-Unsubscribe": `<${unsubscribeUrl(row.email)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } })
    .catch((e) => ({ status: "failed", detail: e.message }))];
}

/** Sends every due follow-up. Runs every minute in-process and via /api/cron/followups. */
let running = false;
export async function runDueFollowups() {
  if (running) return { skipped: "already running" };
  running = true;
  try {
    const pending = await db.select("lead_followups", { status: "pending" }, { order: "send_at", desc: false, limit: 500 });
    const due = pending.filter((r) => new Date(r.send_at).getTime() <= Date.now()).slice(0, 50);
    let sent = 0;
    for (const row of due) {
      if (await isUnsubscribed(row.email)) { await db.update("lead_followups", { id: row.id }, { status: "cancelled", detail: "unsubscribed" }); continue; }
      const results = await deliver(row);
      const ok = results.some((r) => r.status === "sent");
      const allSkipped = results.every((r) => r.status === "skipped");
      await db.update("lead_followups", { id: row.id }, {
        status: ok ? "sent" : allSkipped ? "skipped" : "failed", sent_at: new Date().toISOString(),
        detail: results.map((r) => `${r.status}${r.detail ? `: ${r.detail}` : ""}`).join(" | ").slice(0, 500),
      });
      if (ok) sent++;
    }
    return { due: due.length, sent };
  } finally { running = false; }
}

export function startFollowupScheduler() {
  const t = setInterval(() => runDueFollowups().catch((e) => console.warn("[followups]", e.message)), 60_000);
  t.unref();
}
