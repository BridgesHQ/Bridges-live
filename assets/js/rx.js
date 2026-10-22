/* Bridges — real-estate pages: Kuaishou-style live tiles (vertical, each with its own
 * "Request a showing") and the phone dock. Real data only: tiles come from /api/slots; a LIVE badge
 * appears only for a slot the API reports live; recorded videos fill in between broadcasts. */
(function () {
  "use strict";
  var RX = (window.RX = {});
  var esc = function (t) { return window.BXC ? BXC.esc(t) : String(t == null ? "" : t); };
  var PLAY = '<span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>';

  function tile(x, i) {
    var s = x.stream, v = x.video, live = x.kind === "live";
    var img = (s && s.image) || (v && v.thumbnail) || "";
    var top = live ? '<span class="bx-live">Live' + (x.viewers > 0 ? " · " + x.viewers : "") + "</span>" : '<span class="bx-tag">' + esc(v ? v.platformLabel : "Starts soon") + "</span>";
    var kicker = s ? [s.categoryLabel, s.location].filter(Boolean).join(" · ") : v && v.publishedAt && window.BXC ? BXC.date(v.publishedAt) : "Recent tour";
    return '<div class="rx-tile" role="button" tabindex="0" data-rx="' + i + '">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : "")
      + '<span class="t">' + top + "</span>" + (live || v ? PLAY : "")
      + '<span class="b"><small>' + esc(kicker) + "</small><b>" + esc(s ? s.title : v ? v.title : "") + '</b><span class="ask" data-rx-ask="' + i + '">Request a showing</span></span></div>';
  }
  function offTile(label, wide) {
    return '<div class="rx-tile rx-tile--off' + (wide ? " rx-tile--wide" : "") + '"><span><small>Off air</small><b style="display:block">' + esc(label || "The next live tour is being scheduled.") + '</b></span><span class="ask" data-rx-notify>Notify me when we go live</span></div>';
  }

  /** Fill `el` with live tiles. opts: { cats: ["new","apt"] (stream categories), max, source, offLabel, hideEmpty (element to hide when nothing has aired) } */
  RX.tile = tile;
  RX.offTile = offTile;
  RX.liveStrip = function (el, opts) {
    opts = opts || {};
    var max = opts.max || 8, slots = [];
    el.innerHTML = new Array(Math.min(max, 4) + 1).join('<div class="rx-tile rx-tile--off bx-skel" aria-hidden="true"></div>');
    function want(x) {
      if (x.kind === "upcoming" && !x.stream) return false;
      if (x.stream && opts.cats && opts.cats.length && opts.cats.indexOf(x.stream.category) < 0) return false;
      return true;
    }
    function render() {
      var list = slots.filter(want).slice(0, max);
      if (opts.hideEmpty && !list.length) { (opts.hideEmpty === true ? el : opts.hideEmpty).hidden = true; return; }
      el.innerHTML = (list.some(function (x) { return x.kind === "live"; }) ? "" : offTile(opts.offLabel, !list.length)) + list.map(function (x) { return tile(x, slots.indexOf(x)); }).join("");
    }
    el.addEventListener("click", function (e) {
      var a = e.target.closest("[data-rx-ask],[data-rx-notify],[data-rx]");
      if (!a) return;
      if (a.hasAttribute("data-rx-notify")) return window.BXC && BXC.notifyLive(opts.source);
      var x = slots[+(a.getAttribute("data-rx-ask") || a.getAttribute("data-rx"))];
      if (!x) return;
      if (a.hasAttribute("data-rx-ask")) {
        e.stopPropagation();
        if (x.stream) return BL.requestShowing(x.stream);
        return BL.requestShowingFor({ title: x.video.title, meta: x.video.platformLabel + " video", link: x.video.permalink, source: opts.source || "Live tile — Request a showing" });
      }
      if (x.kind === "live") location.href = "/live-marketplace?stream=" + encodeURIComponent(x.stream ? x.stream.id : x.video.id);
      else if (x.video && window.BXC) BXC.play(x.video);
    });
    el.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.hasAttribute("data-rx")) e.target.click(); });
    var load = function () { return BL.api("/slots?n=24").then(function (j) { slots = j.slots || []; render(); }).catch(function () { slots = []; render(); }); };
    BL.available.then(function (ok) { if (ok) { load(); BL.lobby(); BL.on("stream_status", function () { setTimeout(load, 800); }); } else render(); });
  };

  /** The phone dock: one "Request a showing" button, shown once the hero has scrolled away. */
  RX.dock = function (label, source) {
    var d = document.createElement("div");
    d.className = "rx-dock";
    d.innerHTML = "<span><b>" + esc(label) + "</b>A licensed broker confirms every request.</span>"
      + '<a class="bx-btn" href="/listings" data-showing data-source="' + esc(source || "Dock — Request a showing") + '">Request a showing</a>';
    document.body.appendChild(d);
    var on = function () { d.classList.toggle("on", window.scrollY > window.innerHeight * 0.55); };
    window.addEventListener("scroll", on, { passive: true }); on();
  };
})();
