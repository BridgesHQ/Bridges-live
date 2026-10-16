// "Today's Content": a daily real-estate short-video script, caption, hashtags and a phone
// shotlist, on a rotating weekday theme. Uses the Anthropic API when ANTHROPIC_API_KEY is set;
// otherwise falls back to a built-in template so the tab always has something to post.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { db } from "../db.js";

export const THEMES = {
  1: { key: "market", label: "Market update & builder incentive", brief: "A quick Tampa Bay market pulse plus one builder incentive buyers should ask about (closing-cost credit, rate buydown, design-center dollars). Never state a specific rate, price or incentive amount as fact — use [brackets] for numbers Dorota must fill in from a current source." },
  2: { key: "model-tour", label: "Model home tour", brief: "A walkthrough of a new-construction model home: entry, kitchen, primary suite, one standout feature, and what's standard vs. upgrade." },
  3: { key: "buyer-tip", label: "Buyer tip", brief: "One practical, specific tip for home buyers or renters in Tampa Bay (e.g. bring your own agent to new construction, insurance quotes before offering, how inspections work, apartment move-in specials)." },
  4: { key: "new-community", label: "New community spotlight", brief: "Spotlight a new-construction community or area that is growing: who it suits, amenities to look for, commute, and questions to ask the builder. Do not invent specific community facts — keep claims general or mark them [verify]." },
  5: { key: "neighborhood", label: "Neighborhood guide", brief: "A neighborhood guide: the vibe, everyday conveniences, commute, and who it suits — without describing residents by protected characteristics." },
  6: { key: "weekend-tour", label: "Weekend live tour invite", brief: "Invite viewers to the weekend live tour on Bridges Live: what we'll see, how to ask questions in the chat, and how to request a showing in one tap." },
  0: { key: "relocation", label: "Relocation Q&A", brief: "Answer one common question from people relocating to Tampa Bay (from another state or country): timing, insurance, schools research, renting first, or touring homes remotely by live video." },
};
const AREAS = ["Riverview", "Brandon", "Wesley Chapel", "Apollo Beach", "Parrish", "Lithia & FishHawk", "Sun City Center", "Ruskin", "Wimauma", "Lakewood Ranch", "Tampa", "Sarasota", "Clearwater", "St. Petersburg"];

export const aiEnabled = () => !!config.anthropic.key;

/** Today's date (YYYY-MM-DD) in Tampa time. */
export function today(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function themeFor(date, override) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  const t = (override && Object.values(THEMES).find((x) => x.key === override)) || THEMES[day];
  // rotate the featured area by week so consecutive weeks differ
  const week = Math.floor(new Date(date + "T12:00:00Z").getTime() / (7 * 864e5));
  return { ...t, area: AREAS[(week + day) % AREAS.length] };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "hook", "script", "caption", "hashtags", "shotlist", "cta", "on_screen_text", "compliance_check"],
  properties: {
    title: { type: "string", description: "Internal title for this post, max 70 characters" },
    hook: { type: "string", description: "The first spoken line (under 2 seconds) that stops the scroll" },
    script: {
      type: "array", description: "Spoken lines in order, 30-45 seconds total",
      items: { type: "object", additionalProperties: false, required: ["time", "say"], properties: { time: { type: "string", description: "e.g. 0:00-0:03" }, say: { type: "string" } } },
    },
    on_screen_text: { type: "array", items: { type: "string" }, description: "3-5 short text overlays" },
    caption: { type: "string", description: "Instagram/TikTok/Facebook caption, 60-140 words, ending with the broker line" },
    hashtags: { type: "array", items: { type: "string" }, description: "10-15 hashtags, each starting with #" },
    shotlist: {
      type: "array", description: "What to film on a phone, in order, 5-8 shots",
      items: { type: "object", additionalProperties: false, required: ["shot", "how", "seconds"], properties: { shot: { type: "string" }, how: { type: "string", description: "framing / movement / tip" }, seconds: { type: "integer" } } },
    },
    cta: { type: "string", description: "Call to action pointing to live.bridgesglobal.co or WhatsApp" },
    compliance_check: { type: "string", description: "One sentence confirming the brokerage disclosure is present and listing anything Dorota must verify before posting" },
  },
};

const SYSTEM = `You write short vertical videos (Reels, TikTok, YouTube Shorts) for Dorota Maslowska, Broker Associate at LPT Realty, who runs Bridges Live — live video home tours across Tampa Bay, Florida. She speaks English and Polish and works with local buyers, renters, sellers and people relocating from other states and countries.

Voice: warm, confident, expert, concise. Sounds like a person talking to camera, not an ad. Short sentences.

Rules you must follow:
- Florida advertising: the caption must end with the line "Dorota Maslowska, Broker Associate | LPT Realty".
- Fair Housing: describe properties and amenities, never people. Do not use words like "family-friendly", "perfect for families", "safe neighborhood", "exclusive", or anything about race, religion, national origin, sex, disability or familial status.
- Never invent facts. Any specific number (price, rate, incentive amount, HOA, tax, distance) goes in [square brackets] for Dorota to fill in from a current source.
- No guarantees about appreciation, rates or approval.
- The call to action points viewers to watch live tours at live.bridgesglobal.co or message on WhatsApp.
- The shotlist must be filmable alone with a phone in under 20 minutes.`;

function prompt(date, t, notes) {
  return `Write today's video for ${date}.
Theme: ${t.label}. ${t.brief}
Featured area if relevant: ${t.area}, Florida.${notes ? `\nDorota's notes for today: ${notes}` : ""}`;
}

let client = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.key, ...(config.anthropic.baseURL ? { baseURL: config.anthropic.baseURL } : {}) });
  return client;
}

async function generateAI(date, t, notes) {
  const res = await anthropic().beta.messages.create({
    model: config.anthropic.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if a safety classifier declines, Anthropic re-runs on its recommended model
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt(date, t, notes) }],
  });
  if (res.stop_reason === "refusal") throw new Error("The AI declined this request — try different notes or use the template.");
  if (res.stop_reason === "max_tokens") throw new Error("The AI response was cut off — try again.");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const data = JSON.parse(text);
  return { ...data, model: res.model };
}

/** Deterministic fallback when no Anthropic key is configured. */
export function generateTemplate(date, t, notes) {
  const a = t.area;
  const base = {
    market: { title: `Tampa Bay market + incentive — ${a}`, hook: "Builders are still paying buyers to move — here's what to ask for.", points: ["Here's this week's Tampa Bay market in 30 seconds.", `New construction around ${a} is offering incentives like [closing-cost credit] or a [rate buydown].`, "But those incentives are negotiated — and you keep more of them when you bring your own agent.", "Register your agent before your first model-home visit, or you can lose that protection."] },
    "model-tour": { title: `Model home tour — ${a}`, hook: "Come with me inside this new model home.", points: ["Walk in with me — this is the [model name] in " + a + ".", "Kitchen first: look at what's standard versus upgrade.", "Primary suite: ask how much of this is the designer's add-ons.", "My favorite detail: [standout feature]. Starting from [price]."] },
    "buyer-tip": { title: "Buyer tip of the week", hook: "Don't walk into a model home without doing this first.", points: ["The on-site sales agent works for the builder, not for you.", "Bringing your own broker costs you nothing — the builder pays.", "You get someone negotiating incentives and reviewing the contract for you.", "Just register your agent on your very first visit."] },
    "new-community": { title: `New community spotlight — ${a}`, hook: `Here's what's being built in ${a} right now.`, points: [`${a} has new communities going up — here's what to look at.`, "Amenities: ask what's finished now versus promised later.", "Commute: drive it at rush hour before you sign.", "Ask the builder about CDD fees and HOA: [CDD] and [HOA] per year."] },
    neighborhood: { title: `Neighborhood guide — ${a}`, hook: `Thinking about ${a}? Watch this first.`, points: [`Here's ${a} in 30 seconds.`, "Everyday life: groceries, coffee, parks and the drive to Tampa.", "Homes here range from [price range].", "Want to see it live? I tour homes here every week."] },
    "weekend-tour": { title: "This weekend on Bridges Live", hook: "You can tour homes this weekend without leaving your couch.", points: ["This weekend I'm going live from " + a + ".", "Ask anything in the chat — HOA, schools, commute — I'll answer on camera.", "Like what you see? Tap Request a showing and I'll set it up.", "Turn on alerts at live.bridgesglobal.co."] },
    relocation: { title: "Relocation Q&A", hook: "Moving to Tampa Bay? This is the question everyone asks me.", points: ["Should you rent first or buy right away?", "Renting first lets you learn the neighborhoods before committing.", "Buying right away can lock in a home before you move — I tour it live for you.", "Either way, get home-insurance quotes early."] },
  }[t.key];
  const lines = [base.hook, ...base.points, "Watch live tours at live.bridgesglobal.co — or message me on WhatsApp."];
  const step = Math.floor(40 / lines.length);
  return {
    title: base.title,
    hook: base.hook,
    script: lines.map((say, i) => ({ time: `0:${String(i * step).padStart(2, "0")}-0:${String((i + 1) * step).padStart(2, "0")}`, say })),
    on_screen_text: [base.hook.replace(/[.—].*$/, ""), t.label, "Watch live: live.bridgesglobal.co"],
    caption: `${base.hook} ${base.points.join(" ")}\n\nWatch live home tours and request a showing in one tap at live.bridgesglobal.co — or send me a WhatsApp message. I speak English & Polish 🇵🇱${notes ? `\n\n${notes}` : ""}\n\nDorota Maslowska, Broker Associate | LPT Realty`,
    hashtags: ["#TampaRealEstate", "#TampaBay", `#${a.replace(/[^A-Za-z]/g, "")}FL`, "#FloridaHomes", "#NewConstruction", "#MovingToFlorida", "#TampaRealtor", "#HomeTour", "#FirstTimeHomeBuyer", "#BridgesLive", "#LPTRealty", "#RelocateToFlorida"],
    shotlist: [
      { shot: "Hook to camera", how: "Selfie framing, eye level, natural light behind the phone. Say the hook in one breath.", seconds: 3 },
      { shot: "Establishing shot", how: t.key === "buyer-tip" || t.key === "relocation" ? "Walk toward a model home or front door, phone at chest height." : `Slow pan of the street or entrance in ${a}.`, seconds: 4 },
      { shot: "Detail #1", how: "Close-up of the feature you're talking about (kitchen island, sign, amenity). Hold 3 seconds.", seconds: 4 },
      { shot: "Walk-and-talk", how: "Walk slowly while talking; keep the phone vertical and steady with two hands.", seconds: 10 },
      { shot: "Detail #2", how: "Second close-up or B-roll (pool, park, view from window).", seconds: 4 },
      { shot: "CTA to camera", how: "Back to selfie framing: point down to the caption / say live.bridgesglobal.co.", seconds: 5 },
    ],
    cta: "Watch live tours at live.bridgesglobal.co or message me on WhatsApp.",
    compliance_check: "Broker line included. Fill in every [bracketed] number from a current source before posting.",
    model: null,
  };
}

/** Generate (and save) the content for a date. Replaces any existing draft for that date. */
export async function generateForDate(date, { theme, notes } = {}) {
  const t = themeFor(date, theme);
  let data, source = "template", warning = null;
  if (aiEnabled()) {
    try { data = await generateAI(date, t, notes); source = "ai"; }
    catch (e) { warning = `AI generation failed (${e.message}) — showing the template instead.`; console.warn("[content]", e.message); }
  }
  if (!data) data = generateTemplate(date, t, notes);
  const row = { post_date: date, theme: t.key, status: "draft", source, data: { ...data, theme_label: t.label, area: t.area, notes: notes || "" } };
  const existing = (await db.select("content_posts", { post_date: date }).catch(() => []))[0];
  const saved = existing ? (await db.update("content_posts", { id: existing.id }, { ...row, updated_at: new Date().toISOString() }))[0] : await db.insert("content_posts", row);
  return { post: saved, warning };
}

export async function recentPosts(limit = 14) {
  return db.select("content_posts", {}, { order: "post_date", limit }).catch(() => []);
}

/** Called by the cron: make sure today's post exists; email it to the owner once, from CONTENT_EMAIL_HOUR (7am Tampa time). */
export async function ensureToday(sendEmail) {
  const date = today();
  let post = (await db.select("content_posts", { post_date: date }).catch(() => []))[0];
  if (!post) post = (await generateForDate(date)).post;
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (post && !post.emailed_at && config.leads.ownerEmail && sendEmail && (hour >= config.contentEmailHour || process.env.CONTENT_EMAIL_ANYTIME === "true")) {
    const d = post.data || {};
    const esc = (s) => String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
    const r = await sendEmail({
      to: config.leads.ownerEmail,
      subject: `Today's video: ${d.title || d.theme_label}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;max-width:600px"><p><b>${esc(d.theme_label)}</b> — ${esc(date)}</p><p style="font-size:18px"><b>Hook:</b> ${esc(d.hook)}</p>`
        + `<h3>Script</h3>${(d.script || []).map((l) => `<p><b>${esc(l.time)}</b> ${esc(l.say)}</p>`).join("")}`
        + `<h3>Shotlist</h3><ol>${(d.shotlist || []).map((s) => `<li><b>${esc(s.shot)}</b> (${s.seconds}s) — ${esc(s.how)}</li>`).join("")}</ol>`
        + `<h3>Caption</h3><p style="white-space:pre-wrap">${esc(d.caption)}</p><p>${esc((d.hashtags || []).join(" "))}</p>`
        + `<p><a href="${config.appUrl}/admin#content">Open Today's Content in admin</a></p></div>`,
      text: `${d.theme_label}\nHook: ${d.hook}\n\n${(d.script || []).map((l) => `${l.time} ${l.say}`).join("\n")}\n\n${d.caption}\n${(d.hashtags || []).join(" ")}`,
    }).catch((e) => ({ status: "failed", detail: e.message }));
    if (r?.status === "sent") post = (await db.update("content_posts", { id: post.id }, { emailed_at: new Date().toISOString() }).catch(() => []))[0] || post;
  }
  return post;
}
