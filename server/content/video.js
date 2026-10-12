// Plug-in point for an AI video tool (e.g. Higgsfield) — not required today.
// Each provider takes a saved content post and returns { status, detail, url? }.
// To add one: implement a function below and select it with VIDEO_PROVIDER.
//   VIDEO_PROVIDER=webhook  VIDEO_WEBHOOK_URL=https://…   → POSTs the script/shotlist as JSON
//                                                           (works with Zapier / Make / your own job)
//   VIDEO_PROVIDER=higgsfield HIGGSFIELD_API_KEY=…        → reserved; wire the API call in `higgsfield()`
import { config } from "../config.js";

const PROVIDERS = {
  async webhook(post) {
    if (!config.video.webhookUrl) return { status: "skipped", detail: "Set VIDEO_WEBHOOK_URL" };
    const d = post.data || {};
    const res = await fetch(config.video.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, date: post.post_date, theme: d.theme_label, title: d.title, hook: d.hook, script: d.script, on_screen_text: d.on_screen_text, shotlist: d.shotlist, caption: d.caption, hashtags: d.hashtags }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Video webhook returned ${res.status}`);
    return { status: "sent", detail: "Sent to your video webhook" };
  },
  async higgsfield() {
    if (!config.video.higgsfieldKey) return { status: "skipped", detail: "Set HIGGSFIELD_API_KEY" };
    return { status: "skipped", detail: "Higgsfield is reserved but not wired yet — add the API call in server/content/video.js" };
  },
};

export function videoProvider() {
  const name = config.video.provider;
  return { name: name || null, enabled: !!(name && PROVIDERS[name]) };
}

export async function renderVideo(post) {
  const p = PROVIDERS[config.video.provider];
  if (!p) return { status: "skipped", detail: "No AI video tool connected yet (VIDEO_PROVIDER)." };
  return p(post);
}
