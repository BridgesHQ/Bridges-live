/* Bridges Live — shared browser client.
 * Realtime (WebSocket chat, viewer counts, "just bought / just reserved"), live video player,
 * PayPal checkout (matcha "Buy now") and the same engine for property "Request a showing" /
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
    if (m.type === "item_purchased") return "🍵 " + m.buyerFirst + " just bought " + m.product + (m.addons && m.addons.length ? " + " + m.addons.join(", ") : "") + "!";
    if (m.type === "hold_reserved") return "🔑 " + m.buyerFirst + " just reserved a hold on " + m.title + "!";
    if (m.type === "showing_requested") return "🏠 " + m.name + " just requested a showing of " + m.title;
    return null;
  };

  // ---------------------------------------------------------------- styles
  var css = ""
    + ".bl-ov{position:fixed;inset:0;z-index:5000;background:rgba(5,8,16,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:'DM Sans',system-ui,sans-serif}"
    + ".bl-md{background:#131a2b;color:#fff;border:1px solid rgba(216,188,106,.35);border-radius:16px;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.5)}"
    + ".bl-md h3{font-family:Marcellus,serif;font-weight:400;font-size:21px;margin:0 0 4px;color:#fff}"
    + ".bl-md .sub{color:#8fa0c0;font-size:13px;margin-bottom:14px}"
    + ".bl-md label.row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #2a3550;border-radius:10px;margin-bottom:8px;cursor:pointer;font-size:14px}"
    + ".bl-md label.row b{margin-left:auto;color:#D8BC6A;font-weight:600}"
    + ".bl-md input[type=text],.bl-md input[type=email],.bl-md input[type=tel],.bl-md input[type=datetime-local],.bl-md textarea{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid #2a3550;background:#0f1626;color:#fff;font-size:14px;margin-bottom:9px;font-family:inherit}"
    + ".bl-md .tot{display:flex;justify-content:space-between;font-size:15px;margin:12px 0;padding-top:12px;border-top:1px solid #1e2740}"
    + ".bl-md .tot b{color:#D8BC6A;font-size:18px}"
    + ".bl-md .btn{display:block;width:100%;border:none;border-radius:10px;padding:13px;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit}"
    + ".bl-md .btn.go{background:#1A5C3A;color:#fff}.bl-md .btn.gold{background:#D8BC6A;color:#0a0e1a}.bl-md .btn.ghost{background:transparent;color:#8fa0c0;margin-top:6px}"
    + ".bl-md .btn[disabled]{opacity:.55;cursor:wait}"
    + ".bl-md .err{color:#ff8b80;font-size:13px;margin:6px 0;min-height:1em}"
    + ".bl-md .fine{color:#8fa0c0;font-size:11.5px;line-height:1.45;margin-top:10px}"
    + ".bl-md .sim{border:1px dashed #D8BC6A;border-radius:12px;padding:14px;text-align:center;margin-top:6px}"
    + ".bl-md .sim .pp{font-weight:800;font-size:18px;color:#fff;margin-bottom:4px}.bl-md .sim .pp span{color:#009cde}"
    + ".bl-md .ok{text-align:center;padding:10px 0}.bl-md .ok .big{font-size:44px}"
    + ".bl-x{float:right;background:none;border:none;color:#8fa0c0;font-size:22px;cursor:pointer;line-height:1}"
    + ".bl-toasts{position:fixed;left:16px;bottom:16px;z-index:4500;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(360px,calc(100vw - 32px))}"
    + ".bl-toast{background:rgba(10,14,26,.92);color:#fff;border:1px solid rgba(216,188,106,.45);border-radius:12px;padding:10px 14px;font:600 13.5px 'DM Sans',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);animation:blIn .35s ease}"
    + "@keyframes blIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}"
    + ".bl-player{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;background:transparent}"
    + ".bl-poster{position:absolute;inset:0;background-size:cover;background-position:center;animation:blKen 18s ease-in-out infinite alternate}"
    + "@keyframes blKen{from{transform:scale(1)}to{transform:scale(1.08)}}"
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
    if (url && ytId(url)) {
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

  /** Matcha "Buy now" — PayPal intent CAPTURE. */
  BL.buy = function (s) {
    var p = s.product;
    if (!p) return BL.toast("Nothing for sale on this stream.");
    var m = modal('<h3>' + esc(p.name) + '</h3><div class="sub">Live from ' + esc(s.host) + ' · ships from Bridges HQ</div>'
      + '<label class="row"><input type="checkbox" checked disabled> ' + esc(p.name) + "<b>" + money(p.price, p.currency) + "</b></label>"
      + p.addons.map(function (a) { return '<label class="row"><input type="checkbox" class="bl-addon" value="' + esc(a.id) + '"> + ' + esc(a.name) + "<b>" + money(a.price, p.currency) + "</b></label>"; }).join("")
      + '<input type="text" name="nm" placeholder="First name (shown as “Maria just bought”)" maxlength="40" value="' + esc(BL.name()) + '">'
      + '<div class="tot"><span>Total</span><b class="t"></b></div><div class="err"></div><div class="slot"></div>'
      + '<div class="fine">Secure checkout by PayPal. Card or PayPal balance. Bridges never sees your card details.</div>');
    function total() { return p.price + [].reduce.call(m.el.querySelectorAll("input.bl-addon:checked"), function (sum, c) { var a = p.addons.filter(function (x) { return x.id === c.value; })[0]; return sum + (a ? a.price : 0); }, 0); }
    function refresh() {
      m.q(".t").textContent = money(total(), p.currency);
      var simBtn = m.q(".sim button"); if (simBtn && !simBtn.disabled) simBtn.textContent = "Pay " + money(total(), p.currency);
    }
    [].forEach.call(m.el.querySelectorAll("input.bl-addon"), function (c) { c.onchange = refresh; });
    refresh();
    var err = m.q(".err");
    function onError(e) { err.textContent = e.message || "Payment failed — please try again."; }
    (function render() {
      BL.config().then(function (cfg) {
        payWith(m.q(".slot"), cfg, "capture", function () {
          err.textContent = "";
          var nm = m.q("input[name=nm]").value.trim(); if (nm) BL.setName(nm);
          var addons = [].map.call(m.el.querySelectorAll("input.bl-addon:checked"), function (c) { return c.value; });
          return BL.api("/checkout", { streamId: s.id, addons: addons, name: nm }).then(function (j) { return j.orderId; });
        }, function (orderId) {
          return BL.api("/checkout/" + encodeURIComponent(orderId) + "/capture", {}).then(function (j) {
            success(m, "🍵", "Order confirmed", "Thank you! Your matcha is on its way — receipt from PayPal. Order " + j.orderId + ".");
            if (typeof gtag === "function") gtag("event", "purchase", { value: j.amount, currency: "USD", transaction_id: j.orderId });
            return j;
          });
        }, onError, money(total(), p.currency));
      });
    })();
  };

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

  /** CTA for a stream: matcha → Buy now; property → Request a showing (+ Reserve hold). */
  BL.primaryAction = function (s) { return s.cta === "buy" ? BL.buy(s) : BL.requestShowing(s); };
})();
