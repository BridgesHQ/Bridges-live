/* Bridges Live — shared browser client.
 * Realtime (WebSocket chat, viewer counts, "just bought / just reserved"), live video player,
 * PayPal (reserve holds) and property "Request a showing" /
 * "Reserve hold". Works against the Node server in /server. If the API is unreachable (e.g. the
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
    if (m.type === "hold_reserved") return "🔑 " + m.buyerFirst + " just reserved a hold on " + m.title + "!";
    if (m.type === "showing_requested") return "🏠 " + m.name + " just requested a showing of " + m.title;
    return null;
  };

  // ---------------------------------------------------------------- styles
  var css = ""
    + ".bl-ov{position:fixed;inset:0;z-index:5000;background:rgba(5,10,30,.62);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:'DM Sans',system-ui,sans-serif}"
    + ".bl-md{background:#fff;color:#0B1730;border-top:4px solid #C9A84C;border-radius:18px;width:100%;max-width:450px;max-height:calc(100vh - 32px);overflow:auto;padding:26px 24px 22px;box-shadow:0 30px 80px rgba(5,10,30,.4);animation:blIn .25s ease}"
    + ".bl-md h3{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;font-size:28px;line-height:1.1;margin:0 0 6px;color:#0E1E52}"
    + ".bl-md .sub{color:#4A5672;font-size:13.5px;margin-bottom:16px}"
    + ".bl-md .sub span{color:#9C7F2E!important;font-weight:600}"
    + ".bl-md label.row{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid rgba(14,30,82,.14);border-radius:11px;margin-bottom:10px;cursor:pointer;font-size:14px;background:#FAF8F3}"
    + ".bl-md label.row b{color:#9C7F2E!important}"
    + ".bl-md input[type=text],.bl-md input[type=email],.bl-md input[type=tel],.bl-md input[type=datetime-local],.bl-md textarea{width:100%;box-sizing:border-box;padding:13px 14px;border-radius:11px;border:1px solid rgba(14,30,82,.16);background:#fff;color:#0B1730;font-size:15px;margin-bottom:10px;font-family:inherit}"
    + ".bl-md input:focus,.bl-md textarea:focus{outline:2px solid #C9A84C;outline-offset:0;border-color:transparent}"
    + ".bl-md .tot{display:flex;justify-content:space-between;font-size:15px;margin:12px 0;padding-top:12px;border-top:1px solid rgba(14,30,82,.1)}"
    + ".bl-md .tot b{color:#0E1E52;font-size:18px}"
    + ".bl-md .btn{display:block;width:100%;border:none;border-radius:12px;padding:14px;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit}"
    + ".bl-md .btn.go{background:#C9A84C;color:#0E1E52}.bl-md .btn.gold{background:#0E1E52;color:#fff}.bl-md .btn.ghost{background:transparent;color:#4A5672;margin-top:6px}"
    + ".bl-md .btn[disabled]{opacity:.55;cursor:wait}"
    + ".bl-md .err{color:#C0392B;font-size:13px;margin:4px 0 8px;min-height:1em}"
    + ".bl-md .fine{color:#7B859B;font-size:11.5px;line-height:1.5;margin-top:12px}"
    + ".bl-md .sim{border:1px dashed #C9A84C;border-radius:12px;padding:14px;text-align:center;margin-top:6px;background:#FAF8F3}"
    + ".bl-md .sim .pp{font-weight:800;font-size:18px;color:#0E1E52;margin-bottom:4px}.bl-md .sim .pp span{color:#009cde}"
    + ".bl-md .ok{text-align:center;padding:10px 0}.bl-md .ok .big{font-size:44px}"
    + ".bl-md .ok p{color:#4A5672}"
    + ".bl-x{float:right;background:#F3F1EA;border:none;color:#4A5672;width:34px;height:34px;border-radius:50%;font-size:20px;cursor:pointer;line-height:1;margin:-8px -6px 0 0}"
    + ".bl-toasts{position:fixed;left:16px;bottom:16px;z-index:4500;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(360px,calc(100vw - 32px))}"
    + ".bl-toast{background:rgba(14,30,82,.95);color:#fff;border:1px solid rgba(201,168,76,.5);border-radius:12px;padding:10px 14px;font:600 13.5px 'DM Sans',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);animation:blIn .35s ease}"
    + "@keyframes blIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}"
    + ".bl-player{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;background:transparent}"
    + ".bl-poster{position:absolute;inset:0;background-size:cover;background-position:center;animation:blKen 18s ease-in-out infinite alternate}"
    + "@keyframes blKen{from{transform:scale(1)}to{transform:scale(1.08)}}"
    + ".bl-ext{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#fff;color:#0E1E52;font:700 14px Inter,sans-serif;padding:13px 20px;border-radius:999px;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.35);white-space:nowrap}"
    + ".bl-wait{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.55);color:rgba(255,255,255,.85);font:600 12px 'DM Sans',sans-serif;padding:7px 12px;border-radius:20px;white-space:nowrap}";
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

  /** Mounts the stream's live video into `el` (position:relative container). Returns a destroy fn. */
  BL.mountPlayer = function (el, s, opts) {
    opts = opts || {};
    var url = s && s.playbackUrl, hls = null, node;
    el.innerHTML = "";
    if (url && /tiktok\.com\//.test(url)) {
      // TikTok has no embeddable live player: show the cover with a "watch on TikTok" button.
      node = document.createElement("div"); node.className = "bl-poster";
      if (s.image) node.style.backgroundImage = "url('" + String(s.image).replace(/'/g, "%27") + "')";
      el.appendChild(node);
      var a = document.createElement("a"); a.className = "bl-ext"; a.href = url; a.target = "_blank"; a.rel = "noopener";
      a.textContent = "▶ Watch live on TikTok"; el.appendChild(a);
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

  var sdk = {};
  function loadPayPal(cfg, intent) {
    var ns = intent === "authorize" ? "paypalAuthorize" : "paypalCapture";
    if (window[ns]) return Promise.resolve(window[ns]);
    if (!sdk[ns]) sdk[ns] = new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(cfg.paypal.clientId) + "&currency=" + cfg.paypal.currency + "&intent=" + intent + "&components=buttons&disable-funding=paylater";
      s.setAttribute("data-namespace", ns);
      s.onload = function () { ok(window[ns]); }; s.onerror = function () { sdk[ns] = null; no(new Error("Could not load PayPal")); };
      document.head.appendChild(s);
    });
    return sdk[ns];
  }

  /**
   * Renders PayPal (or the local sandbox simulator) into `slot`.
   * create() → Promise<orderId>; approve(orderId) → Promise<result>.
   */
  function payWith(slot, cfg, intent, create, approve, onError, amountLabel) {
    slot.innerHTML = "";
    if (!cfg || cfg.paypal.mode === "mock") {
      slot.innerHTML = '<div class="sim"><div class="pp">Pay<span>Pal</span> <small style="font-size:11px;color:#D8BC6A">SANDBOX SIMULATOR</small></div>'
        + '<div class="fine" style="margin:0 0 10px">No PayPal keys configured yet — this simulates an approved sandbox payment end-to-end (order, database, live "just bought" event). No money moves.</div>'
        + '<button class="btn gold" type="button">' + (intent === "authorize" ? "Approve hold " : "Pay ") + esc(amountLabel) + "</button></div>";
      var b = slot.querySelector("button");
      b.onclick = function () {
        b.disabled = true; b.textContent = "Processing…";
        create().then(approve).catch(function (e) { b.disabled = false; b.textContent = "Try again"; onError(e); });
      };
      return;
    }
    slot.innerHTML = '<div class="fine" style="text-align:center">Loading PayPal…</div>';
    loadPayPal(cfg, intent).then(function (pp) {
      slot.innerHTML = "";
      pp.Buttons({
        style: { layout: "vertical", shape: "rect", label: intent === "authorize" ? "pay" : "buynow", height: 44 },
        createOrder: function () { return create(); },
        onApprove: function (data) { return approve(data.orderID).catch(onError); },
        onError: function (err) { onError(err instanceof Error ? err : new Error("PayPal could not complete the payment.")); },
      }).render(slot);
    }).catch(onError);
  }

  function success(m, icon, title, text) {
    m.el.innerHTML = '<button class="bl-x" aria-label="Close">×</button><div class="ok"><div class="big">' + icon + "</div><h3>" + esc(title) + '</h3><div class="sub">' + esc(text) + '</div><button class="btn gold" type="button">Back to the stream</button></div>';
    m.el.querySelector(".bl-x").onclick = m.close;
    m.el.querySelector(".btn").onclick = m.close;
  }

  /** Property "Reserve hold" — same engine, PayPal intent AUTHORIZE (funds held, not captured). */
  BL.reserveHold = function (s) {
    BL.config().then(function (cfg) {
      if (!cfg || !cfg.holds.enabled) return BL.requestShowing(s);
      var h = cfg.holds;
      var m = modal('<h3>Reserve a hold</h3><div class="sub">' + esc(s.title) + (s.location ? " · " + esc(s.location) : "") + ' · <span style="color:#D8BC6A">' + esc(h.label) + "</span></div>"
        + '<form><input type="text" name="name" placeholder="Full name" required maxlength="80" value="' + esc(BL.name()) + '">'
        + '<input type="email" name="email" placeholder="Email" required maxlength="120"><input type="tel" name="phone" placeholder="Phone / WhatsApp" maxlength="40">'
        + '<label class="row" style="align-items:flex-start"><input type="checkbox" name="agree" style="margin-top:3px"><span style="font-size:12.5px;line-height:1.45">I understand this is a <b style="color:#D8BC6A;margin:0">refundable ' + money(h.amount, h.currency) + ' authorization</b>, not a purchase, deposit or earnest money. PayPal holds the funds; Bridges never captures them automatically and releases the hold on request. A licensed broker will contact me.</span></label>'
        + '<div class="err"></div><button class="btn go" type="submit">Continue to PayPal</button></form><div class="slot"></div>'
        + '<div class="fine">Real estate services by Dorota Maslowska, Broker Associate, LPT Realty · FL BK3519799. Earnest money is never collected through this platform.</div>');
      var err = m.q(".err");
      m.q("form").onsubmit = function (e) {
        e.preventDefault();
        var f = e.target, d = { name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), agree: f.agree.checked };
        if (!d.agree) { err.textContent = "Please confirm the hold terms."; return; }
        BL.setName(d.name.split(" ")[0]);
        var btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Preparing…";
        var orderId = null;
        function onError(x) { err.textContent = x.message || "Could not place the hold."; btn.disabled = false; btn.textContent = "Continue to PayPal"; }
        // create the lead + hold order first (validates input), then hand to PayPal
        BL.api("/holds", { streamId: s.id, name: d.name, email: d.email, phone: d.phone, agree: true }).then(function (j) {
          orderId = j.orderId; f.style.display = "none";
          payWith(m.q(".slot"), cfg, "authorize", function () { return Promise.resolve(orderId); }, function (id) {
            return BL.api("/holds/" + encodeURIComponent(id) + "/authorize", {}).then(function () {
              success(m, "🔑", "Hold reserved", "Your refundable " + money(h.amount, h.currency) + " hold on " + s.title + " is in place. Dorota will call you to schedule a private showing.");
              if (typeof gtag === "function") gtag("event", "generate_lead", { source: "reserve-hold" });
            });
          }, function (x) { f.style.display = ""; onError(x); }, money(h.amount, h.currency));
        }).catch(onError);
      };
    });
  };

  /** Property "Request a showing" — lead + engagement + appointment, broadcast to the room. */
  BL.requestShowing = function (s) {
    var m = modal('<h3>Request a showing</h3><div class="sub">' + esc(s.title) + (s.location ? " · " + esc(s.location) : "") + (s.priceLabel ? ' · <span style="color:#D8BC6A">' + esc(s.priceLabel) + "</span>" : "") + "</div>"
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
        success(m, "🏠", "Showing requested", "You're on the list. Dorota will follow up shortly to confirm a time.");
        if (typeof gtag === "function") gtag("event", "generate_lead", { source: "live-showing" });
      }).catch(function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Request a showing"; });
    };
  };

  /** CTA for a stream: Request a showing (Reserve hold is the secondary action). */
  BL.primaryAction = function (s) { return BL.requestShowing(s); };
})();
