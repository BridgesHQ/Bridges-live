/* Bridges Global — site shell behaviour: nav (transparent over the hero, dropdowns, mobile sheet),
 * scroll reveals, and every [data-showing] button → the "Request a showing" form. */
(function () {
  "use strict";
  var d = document, body = d.body, nav = d.getElementById("bx-nav");
  d.documentElement.classList.remove("no-js");

  // ------------------------------------------------------------ nav state
  if (nav) {
    var over = body.getAttribute("data-nav") === "over";
    var onScroll = function () { nav.classList.toggle("over", over && window.scrollY < 24 && !body.classList.contains("bx-open")); };
    if (over) { onScroll(); window.addEventListener("scroll", onScroll, { passive: true }); }

    var dds = [].slice.call(nav.querySelectorAll(".bx-dd"));
    var closeAll = function (except) { dds.forEach(function (x) { if (x !== except) { x.classList.remove("open"); x.firstElementChild.setAttribute("aria-expanded", "false"); } }); };
    dds.forEach(function (dd) {
      var btn = dd.firstElementChild, t = null;
      btn.addEventListener("click", function (e) { e.stopPropagation(); var o = !dd.classList.contains("open"); closeAll(dd); dd.classList.toggle("open", o); btn.setAttribute("aria-expanded", String(o)); });
      dd.addEventListener("mouseenter", function () { if (!matchMedia("(hover:hover)").matches) return; clearTimeout(t); closeAll(dd); dd.classList.add("open"); btn.setAttribute("aria-expanded", "true"); });
      dd.addEventListener("mouseleave", function () { if (!matchMedia("(hover:hover)").matches) return; t = setTimeout(function () { dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }, 160); });
    });
    d.addEventListener("click", function () { closeAll(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); setSheet(false); } });

    var burger = d.getElementById("bx-burger");
    var setSheet = function (o) {
      body.classList.toggle("bx-open", o);
      if (burger) burger.setAttribute("aria-expanded", String(o));
      if (over) onScroll();
    };
    if (burger) burger.addEventListener("click", function () { setSheet(!body.classList.contains("bx-open")); });
    [].forEach.call(d.querySelectorAll(".bx-sheet a"), function (a) { a.addEventListener("click", function () { setSheet(false); }); });

    var here = location.pathname.replace(/\/$/, "") || "/";
    [].forEach.call(nav.querySelectorAll(".bx-menu > a"), function (a) { if ((a.getAttribute("href") || "").replace(/\/$/, "") === here) a.classList.add("on"); });
  }

  // ------------------------------------------------------------ reveal on scroll
  var rv = d.querySelectorAll(".bx-rv");
  if (rv.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    [].forEach.call(rv, function (el) { io.observe(el); });
  } else { [].forEach.call(rv, function (el) { el.classList.add("in"); }); }
  window.bxReveal = function (root) {
    [].forEach.call((root || d).querySelectorAll(".bx-rv:not(.in)"), function (el) { if (io) io.observe(el); else el.classList.add("in"); });
  };

  // ------------------------------------------------------------ Request a showing (the one CTA)
  var blLoad = null;
  function withBL(fn) {
    if (window.BL && window.BL.requestShowingFor) return fn(window.BL);
    if (!blLoad) blLoad = new Promise(function (ok, no) {
      var s = d.createElement("script"); s.src = "/assets/js/bridges-live.js";
      s.onload = function () { ok(window.BL); }; s.onerror = no; d.head.appendChild(s);
    });
    blLoad.then(fn).catch(function () { location.href = "tel:+18137818888"; });
  }
  d.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-showing]");
    if (!b) return;
    e.preventDefault();
    withBL(function (BL) {
      BL.requestShowingFor({
        heading: b.getAttribute("data-heading") || "Request a showing",
        title: b.getAttribute("data-title") || "Tell us which home — or what you're looking for",
        meta: b.getAttribute("data-meta") || "",
        link: b.getAttribute("data-link") || "",
        source: b.getAttribute("data-source") || "Website — Request a showing",
        notify: b.hasAttribute("data-notify"),
        button: b.getAttribute("data-button") || undefined,
      });
    });
  });

  [].forEach.call(d.querySelectorAll(".bx-y"), function (e) { e.textContent = new Date().getFullYear(); });
})();
