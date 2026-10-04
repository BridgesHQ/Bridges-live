/* Bridges Global — lead pipeline (loaded on every page).
 * 1. Tracking: Meta Pixel (PageView + Lead) and RB2B visitor identification, from site-config.js.
 *    GA4 (G-NN5K59SYSJ) stays in each page's <head>.
 * 2. Capture: every lead form already posts to Supabase /rest/v1/leads. This script routes those
 *    submissions through /api/lead-router instead (save → SMS + email alert → CRM → 5-touch
 *    follow-up), adding page URL, UTM campaign data, SMS consent and a bot honeypot.
 *    If the router can't be reached, the original Supabase request goes through, so no lead is lost.
 * 3. After a lead: Meta "Lead" event + a "book a call" prompt (Calendly / GHL).
 */
(function () {
  "use strict";
  if (window.__bridgesLeadPipeline) return;
  window.__bridgesLeadPipeline = true;
  var C = window.BRIDGES_CONFIG || {};
  var API = (C.apiBase || "").replace(/\/$/, "");

  // ------------------------------------------------------------------ tracking
  if (/^\d{6,20}$/.test(C.metaPixelId || "")) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", C.metaPixelId);
    window.fbq("track", "PageView");
  }
  if (/^[A-Za-z0-9]{6,40}$/.test(C.rb2bKey || "")) {
    !function () { var reb2b = window.reb2b = window.reb2b || []; if (reb2b.invoked) return; reb2b.invoked = true; reb2b.methods = ["identify", "collect"]; reb2b.factory = function (method) { return function () { var args = Array.prototype.slice.call(arguments); args.unshift(method); reb2b.push(args); return reb2b; }; }; for (var i = 0; i < reb2b.methods.length; i++) { var key = reb2b.methods[i]; reb2b[key] = reb2b.factory(key); } reb2b.load = function (key) { var script = document.createElement("script"); script.type = "text/javascript"; script.async = true; script.src = "https://s3-us-west-2.amazonaws.com/b2bjsstore/b/" + key + "/reb2b.js.gz"; var first = document.getElementsByTagName("script")[0]; first.parentNode.insertBefore(script, first); }; reb2b.SNIPPET_VERSION = "1.0.1"; reb2b.load(C.rb2bKey); }();
  }

  // first-touch campaign data (utm_*, fbclid, gclid) for attribution in the CRM
  var UTM_KEY = "bridges_utm";
  try {
    var q = new URLSearchParams(location.search), got = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach(function (k) { if (q.get(k)) got[k] = q.get(k).slice(0, 120); });
    if (Object.keys(got).length && !localStorage.getItem(UTM_KEY)) localStorage.setItem(UTM_KEY, JSON.stringify(got));
  } catch (e) {}
  function utm() { try { return JSON.parse(localStorage.getItem(UTM_KEY) || "{}"); } catch (e) { return {}; } }

  // ------------------------------------------------------------------ forms: consent + honeypot
  var CONSENT = "By submitting, you agree to be contacted by Bridges Global / LPT Realty by phone, email and text (including automated messages) about your inquiry. Consent isn't a condition of purchase. Msg & data rates may apply; reply STOP to opt out.";
  function prepareForm(f) {
    if (f.__bridges) return; f.__bridges = true;
    var hp = document.createElement("input");
    hp.type = "text"; hp.name = "company_website"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true");
    hp.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0";
    f.appendChild(hp);
    if (f.querySelector('input[type="tel"], input[name="phone"]')) {
      var p = document.createElement("p");
      p.className = "bridges-consent"; p.textContent = CONSENT;
      p.style.cssText = "font-size:11px;line-height:1.4;opacity:.7;margin:8px 0 0";
      var btn = f.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
      btn && btn.parentNode === f ? f.insertBefore(p, btn.nextSibling) : f.appendChild(p);
    }
  }
  function prepareAll() { [].forEach.call(document.querySelectorAll("form"), prepareForm); }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", prepareAll) : prepareAll();
  new MutationObserver(function (m) { for (var i = 0; i < m.length; i++) if (m[i].addedNodes.length) { prepareAll(); break; } }).observe(document.documentElement, { childList: true, subtree: true });

  var lastForm = null;
  document.addEventListener("submit", function (e) { lastForm = e.target; }, true);
  function formContext() {
    var f = lastForm && document.contains(lastForm) ? lastForm : null;
    var phone = f && f.querySelector('input[type="tel"], input[name="phone"]');
    return {
      honeypot: f ? ((f.querySelector('[name="company_website"]') || {}).value || "") : "",
      sms_consent: !!(f && f.querySelector(".bridges-consent") && phone && phone.value.trim()),
    };
  }

  // ------------------------------------------------------------------ after a lead
  var prompted = false;
  function afterLead(source, bookingUrl) {
    try { if (window.fbq) window.fbq("track", "Lead", { content_name: source || "Website" }); } catch (e) {}
    var url = bookingUrl || C.bookingUrl;
    if (!url || prompted || /follow-up notes/i.test(source || "")) return;
    prompted = true;
    setTimeout(function () {
      var d = document.createElement("div");
      d.setAttribute("role", "dialog");
      d.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:6000;max-width:340px;background:#0E1E52;color:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 18px 50px rgba(0,0,0,.35);font:14px/1.45 'DM Sans',system-ui,sans-serif";
      d.innerHTML = '<button aria-label="Close" style="float:right;background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1">×</button><b style="font-size:15px">Thanks — you\'re all set.</b><div style="margin:6px 0 12px;opacity:.85">Want to skip the back-and-forth? Pick a time for a quick call with Dorota.</div><a target="_blank" rel="noopener" style="display:inline-block;background:#D8BC6A;color:#0a0e1a;font-weight:700;padding:10px 16px;border-radius:9px;text-decoration:none">Book a 15-min call</a>';
      d.querySelector("a").href = url;
      d.querySelector("button").onclick = function () { d.remove(); };
      document.body.appendChild(d);
    }, 600);
  }

  // ------------------------------------------------------------------ routing
  var nativeFetch = window.fetch.bind(window);
  var LEADS_REST = /\/rest\/v1\/leads(\?|$)/;
  var ENGINE = /\/api\/(showings|holds|streams|leads)$/;   // Bridges Live modals already use the pipeline server-side

  function submit(payload) {
    var c = formContext();
    var body = {
      first_name: payload.first_name, email: payload.email, phone: payload.phone, market: payload.market,
      source: payload.source, notes: payload.notes, priority: payload.priority,
      page_url: location.href.split("#")[0].slice(0, 300), utm: utm(),
      sms_consent: payload.sms_consent === true || c.sms_consent, company_website: c.honeypot,
    };
    return nativeFetch(API + "/api/lead-router", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw Object.assign(new Error(j.error || "router " + r.status), { status: r.status }); return j; }); })
      .then(function (j) { afterLead(body.source, j.booking_url); return j; });
  }
  window.BridgesLead = { submit: submit };

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method === "POST" && LEADS_REST.test(url) && init && typeof init.body === "string") {
      var payload; try { payload = JSON.parse(init.body); } catch (e) { return nativeFetch(input, init); }
      return submit(payload).then(
        function () { return new Response(null, { status: 201, statusText: "Created" }); },
        function () { return nativeFetch(input, init).then(function (r) { if (r.ok) afterLead(payload.source); return r; }); } // router down → save directly
      );
    }
    var p = nativeFetch(input, init);
    if (method === "POST" && ENGINE.test(url.split("?")[0])) {
      p.then(function (r) { if (r.ok) afterLead(/showings/.test(url) ? "Bridges Live — Request a showing" : /holds/.test(url) ? "Bridges Live — Reserve hold" : "Bridges Live"); }).catch(function () {});
    }
    return p;
  };
})();
