// Outbound integrations for the lead pipeline. Each is a no-op ("skipped") until its keys exist,
// so the pipeline runs end-to-end locally and lights up one integration at a time.
import { config } from "../config.js";

const TIMEOUT = 10_000;
async function http(url, opts) {
  const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(TIMEOUT) });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}: ${typeof body === "string" ? body.slice(0, 200) : body.message || JSON.stringify(body).slice(0, 200)}`);
  return body;
}
const skipped = (why) => ({ status: "skipped", detail: why });

export async function sendSms(to, text) {
  const t = config.twilio;
  if (!t.sid || !t.token || !t.from) return skipped("Twilio not configured");
  if (!/^\+[1-9]\d{7,14}$/.test(to || "")) return skipped("no valid E.164 phone");
  const body = await http(`${t.base}/2010-04-01/Accounts/${t.sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${t.sid}:${t.token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: t.from, Body: text.slice(0, 1500) }),
  });
  return { status: "sent", detail: body.sid };
}

export async function sendEmail({ to, subject, html, text, replyTo, headers }) {
  const r = config.resend;
  if (!r.key || !r.from) return skipped("Resend not configured");
  if (!to) return skipped("no email");
  const body = await http(`${r.base}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${r.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: r.from, to: [to], subject, html, text, reply_to: replyTo || config.leads.ownerEmail || undefined, headers }),
  });
  return { status: "sent", detail: body.id };
}

/** HubSpot free CRM: upsert the contact by email (private-app token, scope crm.objects.contacts.write). */
async function hubspot(lead) {
  const c = config.crm;
  const [firstname, ...rest] = String(lead.first_name || "").trim().split(/\s+/);
  const body = await http(`${c.hubspotBase}/crm/v3/objects/contacts/batch/upsert`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.hubspotToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: [{ idProperty: "email", id: lead.email, properties: {
      email: lead.email, firstname: firstname || "", lastname: rest.join(" "), phone: lead.phone || "",
      lifecyclestage: "lead", hs_lead_status: "NEW",
      message: `${lead.source || "Website"} — ${lead.market || ""}\n${lead.notes || ""}`.slice(0, 5000),
    } }] }),
  });
  return { status: "sent", detail: `hubspot ${body.results?.[0]?.id || "ok"}` };
}

/** Generic JSON webhook (GoHighLevel inbound webhook, Zapier, Make, any CRM). */
async function webhook(url, lead, label) {
  await http(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    first_name: lead.first_name, email: lead.email, phone: lead.phone, source: lead.source, market: lead.market,
    notes: lead.notes, page_url: lead.page_url, utm: lead.utm, lead_id: lead.id, created_at: lead.created_at, tags: ["bridges-live", lead.source_tag].filter(Boolean),
  }) });
  return { status: "sent", detail: label };
}

export async function syncCrm(lead) {
  const c = config.crm;
  const jobs = [];
  if (c.hubspotToken) jobs.push(["hubspot", () => hubspot(lead)]);
  if (c.ghlWebhook) jobs.push(["gohighlevel", () => webhook(c.ghlWebhook, lead, "gohighlevel")]);
  if (c.webhook) jobs.push(["webhook", () => webhook(c.webhook, lead, "webhook")]);
  if (!jobs.length) return [{ channel: "crm", ...skipped("no CRM configured") }];
  return Promise.all(jobs.map(async ([name, fn]) => {
    try { return { channel: `crm:${name}`, ...(await fn()) }; }
    catch (e) { return { channel: `crm:${name}`, status: "failed", detail: e.message }; }
  }));
}

export const integrations = () => ({
  sms: !!(config.twilio.sid && config.twilio.token && config.twilio.from),
  email: !!(config.resend.key && config.resend.from),
  crm: [config.crm.hubspotToken && "hubspot", config.crm.ghlWebhook && "gohighlevel", config.crm.webhook && "webhook"].filter(Boolean),
  alertsTo: { phone: !!config.leads.ownerPhone, email: !!config.leads.ownerEmail },
  booking: !!config.leads.bookingUrl,
  smsToLeads: config.leads.smsToLeads,
});
