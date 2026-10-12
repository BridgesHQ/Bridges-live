/* Bridges Live — shared live UI (needs bridges-live.js + /assets/css/live.css).
 *   BLUI.stage(el, stream)   player + chat over the video + action drawer (Request a showing,
 *                            Reserve hold, WhatsApp). Joins the stream's realtime room.
 *   BLUI.card(stream)        grid card HTML (LIVE / Starts soon badge, viewers).
 *   BLUI.open(stream)        stage in a full-screen overlay (marketplace).
 *   BLUI.notify(el, opts)    "Tell me when we go live" form → lead pipeline.
 */
(function () {
  "use strict";
  var BL = window.BL, esc = BL.esc;
  var BLUI = (window.BLUI = {});
  var U = "https://images.unsplash.com/";
  var PHOTO = {
    new: U + "photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=75",
    lux: U + "photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=75",
    apt: U + "photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=75",
    reloc: U + "photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=75",
    tx: U + "photo-1449844908441-8829872d2607?auto=format&fit=crop&w=1200&q=75",
  };
  var cfg = null;
  BL.config().then(function (c) { cfg = c; });

  BLUI.image = function (s) { return s.image || PHOTO[s.category] || "/assets/hero-luxury.jpg"; };
  function bg(s) { return "background-image:url('" + String(BLUI.image(s)).replace(/'/g, "%27") + "'),url('/assets/hero-luxury.jpg')"; }
  function initials(n) { return String(n || "B").split(/\s+/).map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase(); }
  BLUI.avatar = function (s) {
    return s.owner ? '<span class="ls-av" style="background-image:url(/assets/dorota.webp)"></span>' : '<span class="ls-av">' + esc(initials(s.host)) + "</span>";
  };
  BLUI.isLive = function (s) { return s.liveNow !== false; };
  function viewers(n) { return '<span class="ls-view"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg><span class="n">' + (n || 0) + "</span></span>"; }
  function badge(live) { return live ? '<span class="ls-badge"><i></i>Live</span>' : '<span class="ls-badge off"><i></i>Starts soon</span>'; }
  function meta(s) {
    return [s.location ? esc(s.location) : "", s.priceLabel ? "<b>" + esc(s.priceLabel) + "</b>" : ""].filter(Boolean).join(" · ");
  }

  // ---------------------------------------------------------------- card
  BLUI.card = function (s) {
    var live = BLUI.isLive(s);
    return '<button type="button" class="lc' + (live ? "" : " off") + '" data-id="' + esc(s.id) + '" aria-label="Watch ' + esc(s.title) + '">'
      + '<div class="lc-img" style="' + bg(s) + '">' + badge(live) + (live ? viewers(s.viewers) : "")
      + '<span class="lc-play"><svg width="20" height="20" viewBox="0 0 24 24" fill="#0E1E52"><path d="M8 5v14l11-7z"/></svg></span></div>'
      + '<div class="lc-body"><div class="lc-cat">' + esc(s.categoryLabel || "Real estate") + '</div><div class="lc-title">' + esc(s.title) + "</div>"
      + '<div class="lc-meta">' + (meta(s) || "&nbsp;") + "</div>"
      + '<div class="lc-foot"><div class="lc-host">' + BLUI.avatar(s) + "<span>" + esc(s.host) + '</span></div><span class="lc-go">' + (live ? "Watch live →" : "Preview →") + "</span></div></div></button>";
  };

  // ---------------------------------------------------------------- stage
  var active = null; // the stage currently joined to a realtime room
  function on(type, fn) { BL.on(type, function (m) { if (active) fn(active, m); }); }
  on("history", function (st, m) { if (m.streamId !== st.s.id) return; st.chat.innerHTML = ""; (m.events || []).forEach(function (e) { if (e.type === "chat_message" && !e.held) st.say(e.name, e.body); }); });
  on("chat_message", function (st, m) { if (m.streamId !== st.s.id) return; if (m.held) st.sys("Your message is waiting for a moderator."); else st.say(m.name, m.body); });
  on("viewer_count", function (st, m) { if (m.streamId === st.s.id) st.setViewers(m.count); });
  on("like", function (st, m) { if (m.streamId === st.s.id) st.heart(); });
  on("error", function (st, m) { if (m.error && !/not found/i.test(m.error)) st.sys(m.error); });
  on("stream_status", function (st, m) { if (m.streamId === st.s.id) st.setLive(m.live !== false, m.ended); });
  ["showing_requested", "hold_reserved"].forEach(function (t) {
    BL.on(t, function (m) { var txt = BL.describe(m); if (!txt) return; if (active && m.streamId === active.s.id) active.sys(txt); else BL.toast(txt); });
  });

  BLUI.stage = function (el, s, opts) {
    opts = opts || {};
    var holds = function () { return cfg && cfg.holds && cfg.holds.enabled; };
    el.innerHTML = '<div class="ls">'
      + '<div class="ls-video"><div class="ls-media" style="position:absolute;inset:0"></div>'
      + '<div class="ls-top"><span class="b"></span><span class="v"></span><button class="ls-sound" type="button">🔇 Tap for sound</button></div>'
      + '<div class="ls-off"><div><b></b><span></span></div></div>'
      + '<div class="ls-chat" aria-live="polite"></div><div class="ls-hearts"></div></div>'
      + '<form class="ls-say" autocomplete="off"><input class="nm" name="nm" placeholder="First name" maxlength="40" aria-label="Your first name">'
      + '<input name="msg" placeholder="Ask a question live…" maxlength="280" aria-label="Chat message"><button class="like" type="button" aria-label="Send a heart">♥</button><button class="send" type="submit">Send</button></form>'
      + '<div class="ls-drawer"><div><div class="ls-cat"></div><h3 class="ls-title"></h3><div class="ls-meta"></div><div class="ls-host"></div></div>'
      + '<div class="ls-acts"><button class="bx bx-gold" data-a="showing" type="button">Request a showing</button><div class="bx-row"></div></div>'
      + '<div class="ls-fine">Showings are arranged by a licensed broker · Dorota Maslowska, Broker Associate, LPT Realty · Equal Housing Opportunity</div></div></div>';
    var q = function (sel) { return el.querySelector(sel); };
    var st = { s: s, chat: q(".ls-chat") };
    var media = q(".ls-media"), off = q(".ls-off"), destroyPlayer = null, form = q(".ls-say");

    st.say = function (name, body) {
      var d = document.createElement("div"); d.className = "ls-msg";
      d.innerHTML = "<b>" + esc(name || "Guest") + "</b>" + esc(body);
      st.chat.appendChild(d);
      while (st.chat.children.length > 30) st.chat.removeChild(st.chat.firstChild);
    };
    st.sys = function (text) { var d = document.createElement("div"); d.className = "ls-msg sys"; d.textContent = text; st.chat.appendChild(d); };
    st.heart = function () {
      var h = document.createElement("span"); h.textContent = ["♥", "💛", "🏡", "✨"][Math.floor(Math.random() * 4)];
      h.style.left = (4 + Math.random() * 16) + "px"; h.style.color = "#ff5a6e";
      q(".ls-hearts").appendChild(h); setTimeout(function () { h.remove(); }, 2300);
    };
    st.setViewers = function (n) { var v = q(".ls-view .n"); if (v) v.textContent = n; };
    st.setLive = function (live, ended) {
      st.s.liveNow = live;
      q(".ls-top .b").outerHTML = '<span class="b">' + badge(live) + "</span>";
      q(".ls-top .v").innerHTML = live ? viewers(st.s.viewers) : "";
      off.classList.toggle("on", !live);
      if (!live) {
        off.querySelector("b").textContent = ended ? "This live has ended" : st.s.owner ? "Dorota is getting ready" : (st.s.host || "Your host") + " is getting ready";
        off.querySelector("span").textContent = ended ? "Request a showing below — or get notified when the next tour starts." : "This tour starts soon. Stay here — the video appears automatically.";
      }
      if (destroyPlayer) destroyPlayer();
      var sv = Object.assign({}, st.s); if (!live) sv.playbackUrl = null;
      destroyPlayer = BL.mountPlayer(media, sv, { controls: false });
      var vid = media.querySelector("video"), snd = q(".ls-sound");
      snd.style.display = vid ? "inline-flex" : "none";
      snd.onclick = function () { if (!vid) return; vid.muted = !vid.muted; if (!vid.muted) vid.play().catch(function () {}); snd.textContent = vid.muted ? "🔇 Tap for sound" : "🔊 Sound on"; };
    };
    st.set = function (s2) {
      st.s = s2;
      q(".ls-cat").textContent = s2.categoryLabel || "Live tour";
      q(".ls-title").textContent = s2.title;
      q(".ls-meta").innerHTML = meta(s2);
      q(".ls-host").innerHTML = BLUI.avatar(s2) + "<div><b>" + esc(s2.host) + "</b>" + (s2.owner ? "Broker Associate · LPT Realty" : "Licensed agent · Bridges Live") + "</div>";
      actions();
      st.chat.innerHTML = "";
      st.setLive(BLUI.isLive(s2));
      if (active && active !== st) active.detach();
      active = st; BL.join(s2.id);
    };
    st.detach = function () { if (active === st) { active = null; BL.leave(); } };
    st.destroy = function () { st.detach(); if (destroyPlayer) destroyPlayer(); el.innerHTML = ""; };

    // chat
    var nm = form.nm;
    function syncName() { nm.style.display = BL.name() ? "none" : ""; }
    syncName();
    form.onsubmit = function (e) {
      e.preventDefault();
      var msg = form.msg.value.trim();
      if (!BL.name()) { var n = nm.value.trim(); if (!n) { nm.focus(); return; } BL.setName(n.split(/\s+/)[0]); syncName(); }
      if (!msg) return;
      BL.chat(msg); form.msg.value = "";
    };
    q(".like").onclick = function () { BL.like(); st.heart(); };
    // actions
    q(".ls-drawer").addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]"); if (!b) return;
      var a = b.getAttribute("data-a");
      if (a === "showing") BL.requestShowing(st.s);
      else if (a === "hold") BL.reserveHold(st.s);
      else if (a === "wa") window.BridgesWhatsApp.open({ label: "Live stream", streamTitle: st.s.title });
      else form.msg.focus();
    });
    function actions() {
      q(".bx-row").innerHTML = (holds() ? '<button class="bx bx-line" data-a="hold" type="button">Reserve hold</button>' : "")
        + (window.BridgesWhatsApp ? '<button class="bx bx-wa" data-a="wa" type="button">WhatsApp</button>' : '<button class="bx bx-line" data-a="ask" type="button">Ask a question</button>');
    }
    st.set(s);
    BL.config().then(function (c) { cfg = c; actions(); });
    // lead-pipeline.js (deferred) defines BridgesWhatsApp after this runs
    window.addEventListener("load", actions);
    return st;
  };

  // ---------------------------------------------------------------- overlay
  BLUI.open = function (s, onClose) {
    var ov = document.createElement("div"); ov.className = "lov"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.innerHTML = '<button class="lov-x" type="button" aria-label="Close">×</button><div class="lov-in" style="width:min(980px,100%)"></div>';
    document.body.appendChild(ov); document.body.style.overflow = "hidden";
    var st = BLUI.stage(ov.querySelector(".lov-in"), s);
    function close() { st.destroy(); ov.remove(); document.body.style.overflow = ""; document.removeEventListener("keydown", key); if (onClose) onClose(); }
    function key(e) { if (e.key === "Escape" && !document.querySelector(".bl-ov")) close(); }
    ov.querySelector(".lov-x").onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", key);
    return { stage: st, close: close };
  };

  // ---------------------------------------------------------------- notify-me form
  BLUI.notify = function (el, opts) {
    opts = opts || {};
    el.innerHTML = '<form class="nf" novalidate><h3>' + esc(opts.title || "Get a heads-up when we go live") + "</h3>"
      + "<p>" + esc(opts.text || "One message when a tour starts — no spam. Request a private video tour any time.") + "</p>"
      + '<div class="seg"><label><input type="radio" name="via" value="email" checked>Email</label><label><input type="radio" name="via" value="phone">Text / WhatsApp</label></div>'
      + '<input name="name" placeholder="First name" autocomplete="given-name" maxlength="80" required>'
      + '<input name="contact" type="email" placeholder="Email address" autocomplete="email" maxlength="120" required>'
      + '<input name="company_website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">'
      + '<div class="err"></div><button class="bx bx-gold" type="submit">' + esc(opts.button || "Notify me") + "</button>"
      + '<div class="fine">By submitting you agree that Dorota Maslowska (LPT Realty) may contact you by email, phone, text or WhatsApp. Reply STOP or unsubscribe any time.</div></form>';
    var f = el.querySelector("form"), c = f.contact;
    [].forEach.call(f.via, function (r) {
      r.onchange = function () { var ph = f.via.value === "phone"; c.type = ph ? "tel" : "email"; c.placeholder = ph ? "Mobile / WhatsApp number" : "Email address"; c.autocomplete = ph ? "tel" : "email"; c.value = ""; };
    });
    f.onsubmit = function (e) {
      e.preventDefault();
      var err = f.querySelector(".err"), btn = f.querySelector("button[type=submit]");
      var name = f.name.value.trim(), val = c.value.trim(), ph = f.via.value === "phone";
      if (!name) { err.textContent = "Please add your first name."; return; }
      if (ph ? val.replace(/\D/g, "").length < 7 : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { err.textContent = ph ? "Please add a valid phone number." : "Please add a valid email."; return; }
      err.textContent = ""; btn.disabled = true; btn.textContent = "Sending…";
      BL.api("/lead-router", {
        first_name: name, email: ph ? "" : val, phone: ph ? val : "", sms_consent: ph,
        source: opts.source || "Bridges Live — notify me when live", notes: opts.notes || "Wants a heads-up when the next live tour starts.",
        page_url: location.href, company_website: f.company_website.value,
      }).then(function () {
        f.innerHTML = '<div class="done"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.2 3L17 9"/></svg><b>You\'re on the list</b><span style="font-size:14px;color:#4A5672">We\'ll let you know when the next tour goes live. Dorota may reach out personally too.</span></div>';
        try { if (window.fbq) fbq("track", "Lead"); if (typeof gtag === "function") gtag("event", "generate_lead", { source: "notify-live" }); } catch (x) {}
      }).catch(function (x) { err.textContent = x.message || "Something went wrong — please try again."; btn.disabled = false; btn.textContent = opts.button || "Notify me"; });
    };
  };
})();
