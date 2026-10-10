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

export async function sendEmail({ to, subject, html, text, replyTo, headers }) {
  const r = config.resend;
  if (!r.key || !r.from) return skipped("Resend not configured");
  if (!to) return skipped("no email");
  // Resend's shared test sender (onboarding@resend.dev) only delivers to the account owner.
  if (/@resend\.dev>?\s*$/i.test(r.from) && to.toLowerCase() !== (config.leads.ownerEmail || "").toLowerCase()) {
    return skipped("verify bridgesglobal.co in Resend to email leads");
  }
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
  const props = {
    email: lead.email, firstname: firstname || "", lastname: rest.join(" "), phone: lead.phone || "",
    lifecyclestage: "lead", hs_lead_status: "NEW",
    message: `${lead.source || "Website"} — ${lead.market || ""}\n${lead.notes || ""}`.slice(0, 5000),
  };
  const send = (properties) => http(`${c.hubspotBase}/crm/v3/objects/contacts/batch/upsert`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.hubspotToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: [{ idProperty: "email", id: lead.email, properties }] }),
  });
  let body;
  try { body = await send(props); }
  catch (e) {
    // existing contacts further along (e.g. "customer") can't be moved back to "lead" — update the rest
    if (!/ 400: /.test(e.message) || !/lifecycle|lead_status|hs_lead_status/i.test(e.message)) throw e;
    const { lifecyclestage, hs_lead_status, ...restProps } = props;
    body = await send(restProps);
  }
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
  email: !!(config.resend.key && config.resend.from),
  crm: [config.crm.hubspotToken && "hubspot", config.crm.ghlWebhook && "gohighlevel", config.crm.webhook && "webhook"].filter(Boolean),
  alertsTo: { email: !!config.leads.ownerEmail },
  whatsapp: !!config.leads.whatsappNumber,
});
