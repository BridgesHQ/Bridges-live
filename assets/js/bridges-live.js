/* Bridges Live — shared browser client.
 * Realtime (WebSocket chat, viewer counts, "just requested a showing"), live video player and
 * "Request a showing" — the only call to action. Works against the Node server in /server. If the API is unreachable (e.g. the
 * site is served as plain static files), BL.available resolves false and pages keep their
 * existing static behaviour.
 */
(function () {
  "use strict";
  var API = (window.BRIDGES_API_BASE || "").replace(/\/$/, "");
  var BL = (window.BL = {});
  var cfgPromise = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  BL.esc = esc;
  function money(n, cur) { return (cur && cur.toUpperCase() !== "USD" ? cur.toUpperCase() + " " : "$") + Number(n).toFixed(2).replace(/\.00$/, ""); }
  BL.money = money;

  BL.api = function (path, body) {
    return fetch(API + "/api" + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || "Request failed (" + r.status + ")"); e.status = r.status; throw e; }
          return j;
        });
      });
  };
  BL.config = function () {
    if (!cfgPromise) cfgPromise = BL.api("/config").catch(function () { return null; });
    return cfgPromise;
  };
  BL.available = BL.config().then(function (c) { return !!c; });
  BL.streams = function () { return BL.api("/streams").then(function (j) { return j.streams; }); };

  // ---------------------------------------------------------------- viewer name
  BL.name = function () {
    try { return localStorage.getItem("bl_name") || ""; } catch (e) { return ""; }
  };
  BL.setName = function (n) { try { localStorage.setItem("bl_name", n); } catch (e) {} };

  // ---------------------------------------------------------------- realtime
  var ws = null, handlers = {}, queue = [], room = null, wantLobby = false, retry = 0;
  function wsUrl() {
    var base = API || location.origin;
    return base.replace(/^http/, "ws") + "/ws";
  }
  function flush() { while (queue.length && ws && ws.readyState === 1) ws.send(JSON.stringify(queue.shift())); }
  function sendWs(obj) { queue.push(obj); connect(); flush(); }
  function emit(type, msg) { (handlers[type] || []).concat(handlers["*"] || []).forEach(function (fn) { try { fn(msg); } catch (e) { console.error(e); } }); }
  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    ws = new WebSocket(wsUrl());
    ws.onopen = function () {
      retry = 0;
      if (wantLobby) queue.unshift({ type: "lobby" });
      if (room) queue.unshift({ type: "join", streamId: room, name: BL.name() || "Guest" });
      flush(); emit("open", {});
    };
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } emit(m.type, m); };
    ws.onclose = function () { emit("close", {}); setTimeout(connect, Math.min(15000, 1000 * Math.pow(2, retry++))); };
  }
  BL.on = function (type, fn) { (handlers[type] = handlers[type] || []).push(fn); return BL; };
  BL.off = function (type) { delete handlers[type]; return BL; };
  BL.lobby = function () { wantLobby = true; sendWs({ type: "lobby" }); };
  BL.join = function (streamId) { room = streamId; sendWs({ type: "join", streamId: streamId, name: BL.name() || "Guest" }); };
  BL.leave = function () { room = null; sendWs({ type: "leave" }); };
  BL.chat = function (body) { sendWs({ type: "chat", body: body, name: BL.name() || "Guest" }); };
  BL.like = function () { sendWs({ type: "like" }); };

  /** Text line for a commerce/social-proof event, or null. */
  BL.describe = function (m) {
    if (m.type === "showing_requested") return "🏠 " + m.name + " just requested a showing of " + m.title;
    return null;
  };

  // ---------------------------------------------------------------- styles
  var css = ""
    + ".bl-ov{position:fixed;inset:0;z-index:5000;background:rgba(8,15,40,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;padding:0;font-family:Inter,system-ui,-apple-system,sans-serif;animation:blFade .2s ease}"
    + "@media(min-width:640px){.bl-ov{align-items:center;padding:24px}}"
    + ".bl-md{background:#fff;color:#0E1E52;border-radius:22px 22px 0 0;width:100%;max-width:480px;max-height:calc(100vh - 24px);overflow:auto;padding:30px 24px calc(24px + env(safe-area-inset-bottom));box-shadow:0 40px 100px rgba(8,15,40,.35);animation:blUp .3s cubic-bezier(.2,.8,.2,1);box-sizing:border-box}"
    + "@media(min-width:640px){.bl-md{border-radius:22px;padding:34px 32px 28px}}"
    + ".bl-md h3{font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:28px;line-height:1.15;letter-spacing:-.01em;margin:0 0 6px;color:#0E1E52}"
    + ".bl-md .sub{color:#5B6478;font-size:14px;line-height:1.5;margin-bottom:20px}"
    + ".bl-md input[type=text],.bl-md input[type=email],.bl-md input[type=tel],.bl-md textarea{width:100%;box-sizing:border-box;padding:14px 15px;border-radius:12px;border:1px solid #DCDFE7;background:#FAFAF8;color:#0E1E52;font-size:16px;margin-bottom:10px;font-family:inherit;transition:border-color .15s,box-shadow .15s}"
    + ".bl-md input:focus,.bl-md textarea:focus{outline:none;border-color:#C9A84C;box-shadow:0 0 0 4px rgba(201,168,76,.15);background:#fff}"
    + ".bl-md .btn{display:block;width:100%;border:none;border-radius:999px;padding:16px;font-weight:600;font-size:15px;letter-spacing:.01em;cursor:pointer;font-family:inherit;transition:transform .15s,box-shadow .15s,background .15s;margin-top:6px}"
    + ".bl-md .btn.go,.bl-md .btn.gold{background:#0E1E52;color:#fff}.bl-md .btn.go:hover,.bl-md .btn.gold:hover{background:#16296b;box-shadow:0 10px 24px rgba(14,30,82,.25);transform:translateY(-1px)}"
    + ".bl-md .btn[disabled]{opacity:.55;cursor:wait;transform:none}"
    + ".bl-md .err{color:#B3261E;font-size:13px;margin:4px 0;min-height:1em}"
    + ".bl-md .fine{color:#7A8194;font-size:11.5px;line-height:1.55;margin-top:16px;padding-top:14px;border-top:1px solid #EEF0F4}"
    + ".bl-md .ok{text-align:center;padding:14px 0 4px}.bl-md .ok .big{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;background:#F6F1E3;color:#C9A84C;display:flex;align-items:center;justify-content:center;font-size:28px}"
    + ".bl-x{float:right;margin:-14px -8px 0 0;width:40px;height:40px;border-radius:50%;background:#F3F4F7;border:none;color:#0E1E52;font-size:22px;cursor:pointer;line-height:1;transition:background .15s}.bl-x:hover{background:#E7E9EF}"
    + "@keyframes blFade{from{opacity:0}to{opacity:1}}@keyframes blUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}"
    + ".bl-toasts{position:fixed;left:16px;bottom:16px;z-index:4500;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(360px,calc(100vw - 32px))}"
    + ".bl-toast{background:#fff;color:#0E1E52;border-left:3px solid #C9A84C;border-radius:12px;padding:12px 16px;font:500 13.5px Inter,system-ui,sans-serif;box-shadow:0 14px 40px rgba(8,15,40,.18);animation:blIn .35s ease}"
    + "@keyframes blIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}"
    + ".bl-player{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;background:transparent}"
    + ".bl-poster{position:absolute;inset:0;background-size:cover;background-position:center;animation:blKen 18s ease-in-out infinite alternate}"
    + "@keyframes blKen{from{transform:scale(1)}to{transform:scale(1.08)}}"
    + "@media(prefers-reduced-motion:reduce){.bl-poster,.bl-md,.bl-ov,.bl-toast{animation:none}}"
    + ".bl-ext{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;color:#0E1E52;font:600 14px Inter,sans-serif;padding:14px 22px;border-radius:999px;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.35);white-space:nowrap}"
    + ".bl-wait{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.55);color:rgba(255,255,255,.9);font:500 12px Inter,sans-serif;padding:8px 14px;border-radius:20px;white-space:nowrap}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  // ---------------------------------------------------------------- toasts
  var toastBox = null;
  BL.toast = function (text, ms) {
    if (!toastBox) { toastBox = document.createElement("div"); toastBox.className = "bl-toasts"; document.body.appendChild(toastBox); }
    var t = document.createElement("div"); t.className = "bl-toast"; t.textContent = text;
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 6000);
  };

  // ---------------------------------------------------------------- player
  var hlsLoader = null;
  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsLoader) hlsLoader = new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
      s.onload = function () { ok(window.Hls); }; s.onerror = no; document.head.appendChild(s);
    });
    return hlsLoader;
  }
  function ytId(u) { var m = String(u).match(/(?:v=|youtu\.be\/|\/live\/|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; }
  BL.ytId = ytId;
  /** "TikTok" / "Instagram" for a live link that has to be watched on that app, else null. */
  BL.extPlatform = function (u) { return /tiktok\.com\//.test(u || "") ? "TikTok" : /instagram\.com\//.test(u || "") ? "Instagram" : null; };

  /** Mounts the stream's live video into `el` (position:relative container). Returns a destroy fn. */
  BL.mountPlayer = function (el, s, opts) {
    opts = opts || {};
    var url = s && s.playbackUrl, hls = null, node;
    el.innerHTML = "";
    if (url && /(tiktok|instagram)\.com\//.test(url)) {
      // TikTok and Instagram lives cannot be embedded: show the cover with a clear "watch on …" button.
      var plat = BL.extPlatform(url);
      node = document.createElement("div"); node.className = "bl-poster";
      if (s.image) node.style.backgroundImage = "url('" + String(s.image).replace(/'/g, "%27") + "')";
      el.appendChild(node);
      var a = document.createElement("a"); a.className = "bl-ext"; a.href = url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "▶ Live on " + plat + " — watch"; el.appendChild(a);
    } else if (url && /(facebook\.com|fb\.watch)\//.test(url)) {
      node = document.createElement("iframe");
      node.src = "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(url) + "&show_text=false&autoplay=true&mute=1";
      node.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture"; node.allowFullscreen = true;
      node.className = "bl-player"; el.appendChild(node);
    } else if (url && ytId(url)) {
      node = document.createElement("iframe");
      node.src = "https://www.youtube.com/embed/" + ytId(url) + "?autoplay=1&mute=1&playsinline=1&rel=0";
      node.allow = "autoplay; fullscreen; picture-in-picture"; node.allowFullscreen = true;
      node.className = "bl-player"; el.appendChild(node);
    } else if (url) {
      node = document.createElement("video");
      node.className = "bl-player"; node.muted = true; node.autoplay = true; node.playsInline = true; node.controls = !!opts.controls;
      if (s.image) node.poster = s.image;
      el.appendChild(node);
      if (/\.m3u8(\?|$)/.test(url) && !node.canPlayType("application/vnd.apple.mpegurl")) {
        loadHls().then(function (Hls) {
          if (!Hls.isSupported()) return;
          hls = new Hls({ lowLatencyMode: true }); hls.loadSource(url); hls.attachMedia(node);
        }).catch(function () { node.src = url; });
      } else { node.src = url; }
      node.play && node.play().catch(function () {});
    } else {
      node = document.createElement("div"); node.className = "bl-poster";
      if (s && s.image) node.style.backgroundImage = "url('" + String(s.image).replace(/'/g, "%27") + "')";
      el.appendChild(node);
      var w = document.createElement("div"); w.className = "bl-wait"; w.textContent = "◉ Host camera connecting…"; el.appendChild(w);
    }
    return function () { if (hls) hls.destroy(); el.innerHTML = ""; };
  };

  // ---------------------------------------------------------------- modals
  function modal(html) {
    var ov = document.createElement("div"); ov.className = "bl-ov";
    ov.innerHTML = '<div class="bl-md" role="dialog" aria-modal="true"><button class="bl-x" aria-label="Close">×</button>' + html + "</div>";
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".bl-x").onclick = close;
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
    return { el: ov.querySelector(".bl-md"), close: close, q: function (s) { return ov.querySelector(s); } };
  }

  function success(m, icon, title, text) {
    m.el.innerHTML = '<button class="bl-x" aria-label="Close">×</button><div class="ok"><div class="big">' + icon + "</div><h3>" + esc(title) + '</h3><div class="sub">' + esc(text) + '</div><button class="btn gold" type="button">Done</button></div>';
    m.el.querySelector(".bl-x").onclick = m.close;
    m.el.querySelector(".btn").onclick = m.close;
  }

  /** Property "Request a showing" — lead + engagement + appointment, broadcast to the room. */
  BL.requestShowing = function (s) {
    var m = modal('<h3>Request a showing</h3><div class="sub">' + esc(s.title) + (s.location ? " · " + esc(s.location) : "") + (s.priceLabel ? ' · <b style="color:#0E1E52;font-weight:600">' + esc(s.priceLabel) + "</b>" : "") + "</div>"
      + '<form><input type="text" name="name" placeholder="Your name" required maxlength="80" value="' + esc(BL.name()) + '">'
      + '<input type="email" name="email" placeholder="Email" required maxlength="120"><input type="tel" name="phone" placeholder="Phone / WhatsApp" maxlength="40">'
      + '<input type="text" name="when" placeholder="Preferred day / time (e.g. Sat morning)" maxlength="80">'
      + '<textarea name="message" placeholder="Questions for the agent (optional)" maxlength="800" style="min-height:64px"></textarea>'
      + '<div class="err"></div><button class="btn go" type="submit">Request a showing</button></form>'
      + '<div class="fine">A licensed broker follows up — no applications, no obligation. Dorota Maslowska, Broker Associate · LPT Realty · FL BK3519799 · Equal Housing Opportunity.</div>');
    var err = m.q(".err");
    m.q("form").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector("button");
      var d = { streamId: s.id, name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), when: f.when.value.trim(), message: f.message.value.trim() };
      BL.setName(d.name.split(" ")[0]);
      btn.disabled = true; btn.textContent = "Sending…";
      BL.api("/showings", d).then(function () {
        success(m, "✓", "Showing requested", "You're on the list. Dorota will follow up shortly to confirm a time.");
        if (typeof gtag === "function") gtag("event", "generate_lead", { source: "live-showing" });
      }).catch(function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Request a showing"; });
    };
  };

  /** "Request a showing" for a listing or a video (no live room): goes through the lead pipeline. */
  BL.requestShowingFor = function (ctx) {
    ctx = ctx || {};
    var head = ctx.heading || "Request a showing", btnText = ctx.button || "Request a showing";
    var m = modal('<h3>' + esc(head) + '</h3><div class="sub">' + esc(ctx.title || "Tell us what you'd like to see") + (ctx.meta ? " · " + esc(ctx.meta) : "") + "</div>"
      + '<form><input type="text" name="name" placeholder="Your name" required maxlength="80" value="' + esc(BL.name()) + '">'
      + '<input type="email" name="email" placeholder="Email" required maxlength="120"><input type="tel" name="phone" placeholder="Phone / WhatsApp" maxlength="40">'
      + (ctx.notify ? '<input type="hidden" name="when" value=""><input type="hidden" name="message" value="">' : '<input type="text" name="when" placeholder="Preferred day / time (e.g. Sat morning)" maxlength="80">'
      + '<textarea name="message" placeholder="Questions (optional)" maxlength="800" style="min-height:64px"></textarea>')
      + '<input name="company_website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">'
      + '<div class="err"></div><button class="btn go" type="submit">' + esc(btnText) + '</button></form>'
      + '<div class="fine">A licensed broker follows up — no obligation. Dorota Maslowska, Broker Associate · LPT Realty · FL BK3519799 · Equal Housing Opportunity.</div>');
    var err = m.q(".err");
    m.q("form").onsubmit = function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector("button");
      BL.setName(f.name.value.trim().split(" ")[0]);
      btn.disabled = true; btn.textContent = "Sending…";
      BL.api("/lead-router", {
        first_name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), market: ctx.title || "",
        source: ctx.source || "Website — Request a showing", company_website: f.company_website.value, page_url: location.href,
        notes: [ctx.title, ctx.meta, ctx.link, "Preferred time: " + (f.when.value.trim() || "flexible"), f.message.value.trim()].filter(Boolean).join(" · "),
      }).then(function () {
        success(m, ctx.notify ? "✓" : "✓", ctx.notify ? "You're on the list" : "Showing requested", ctx.notify ? "We'll let you know when the next live tour starts." : "You're on the list. Dorota will follow up shortly to confirm a time.");
        if (typeof gtag === "function") gtag("event", "generate_lead", { source: ctx.notify ? "notify-live" : "request-showing" });
      }).catch(function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = btnText; });
    };
  };

  /** CTA for a stream: Request a showing. */
  BL.primaryAction = function (s) { return BL.requestShowing(s); };
})();
