/* Bridges Global — shared cards for live tours / videos (/api/slots) and homes (/api/listings),
 * plus the video lightbox. Real data only: a LIVE badge appears only for a slot the API says is live. */
(function () {
  "use strict";
  var C = (window.BXC = {});
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  C.esc = esc;
  C.money = function (n) { return n ? "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : ""; };
  C.date = function (iso) { try { return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""; } catch (e) { return ""; } };
  var MARK = '<span class="bx-mk"><svg viewBox="0 0 48 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 26C9 7 27 7 33 26"/><path d="M31 26c2.4-7 9.6-7 12 0"/><path d="M1 26h46"/><path d="M12 26v-8M18 26V13M24 26v-8"/></svg></span>';
  var PLAY = '<span class="bx-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>';
  var ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  C.ARROW = ARROW;
  function img(src, alt) {
    return MARK + (src ? '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '" loading="lazy" decoding="async" onerror="this.remove()">' : "");
  }

  // ------------------------------------------------------------ tours (slots)
  C.slotTitle = function (x) { return x.stream ? x.stream.title : x.video ? x.video.title : "Next live tour"; };
  C.slotImage = function (x) { return (x.stream && x.stream.image) || (x.video && x.video.thumbnail) || ""; };

  /** One tour card. `i` is the slot's index in the caller's list (click → C.onSlot(i)). */
  C.slotCard = function (x, i) {
    var live = x.kind === "live", s = x.stream, v = x.video;
    if (x.kind === "upcoming" && !s) {
      return '<button type="button" class="bx-tour bx-tour--next bx-rv" data-notify-live><span class="bx-media bx-r-169">' + MARK
        + '<span class="bx-next"><span class="bx-eyebrow">Off air</span><b>The next live tour</b><span>Get a message the moment it starts</span></span></span>'
        + '<span class="bx-tour-b"><span class="bx-tour-k">Bridges Live</span><span class="bx-tour-t">Next live tour</span><span class="bx-link">Notify me ' + ARROW + "</span></span></button>";
    }
    var badge = live ? '<span class="bx-live">Live' + (x.viewers != null ? ' <span class="bx-vw" data-id="' + esc(s ? s.id : "") + '">· ' + x.viewers + "</span>" : "") + "</span>"
      : s ? '<span class="bx-tag">Starts soon</span>' : '<span class="bx-tag">' + esc(v.platformLabel) + "</span>";
    var kicker = s ? (s.categoryLabel || "Live tour") + (s.location ? " · " + s.location : "") : v.platformLabel + (v.publishedAt ? " · " + C.date(v.publishedAt) : "");
    var cta = live ? "Watch live" : v ? (v.platform === "tiktok" || !v.playable ? "Watch on " + v.platformLabel : "Play tour") : "Starts soon";
    return '<button type="button" class="bx-tour bx-rv" data-slot="' + i + '"><span class="bx-media bx-r-169">' + img(C.slotImage(x), C.slotTitle(x))
      + '<span class="bx-over bx-over--tl">' + badge + "</span>" + (live || v ? PLAY : "") + "</span>"
      + '<span class="bx-tour-b"><span class="bx-tour-k">' + esc(kicker) + '</span><span class="bx-tour-t">' + esc(C.slotTitle(x)) + '</span><span class="bx-link">' + esc(cta) + " " + ARROW + "</span></span></button>";
  };

  // ------------------------------------------------------------ homes (listings)
  C.spec = function (l) {
    return [l.beds ? "<b>" + l.beds + "</b> bd" : "", l.baths ? "<b>" + l.baths + "</b> ba" : "", l.sqft ? "<b>" + Number(l.sqft).toLocaleString("en-US") + "</b> sq ft" : ""].filter(Boolean).join('<i aria-hidden="true"></i>');
  };
  C.homeCard = function (l, i) {
    var type = l.type ? String(l.type).replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : "";
    return '<article class="bx-home bx-rv"><div class="bx-media bx-r-43">' + img(l.photo, l.address)
      + '<span class="bx-over bx-over--tl"><span class="bx-tag">' + esc(l.city || "Tampa Bay") + "</span></span></div>"
      + '<div class="bx-home-b"><div class="bx-home-p">' + C.money(l.price) + "</div>"
      + '<div class="bx-home-a">' + esc(l.address) + "<span>" + esc([l.city, l.state].filter(Boolean).join(", ") + (l.zip ? " " + l.zip : "")) + "</span></div>"
      + '<div class="bx-home-s">' + C.spec(l) + "</div>" + (type ? '<div class="bx-home-t">' + esc(type) + "</div>" : "")
      + '<div class="bx-home-f"><span class="bx-home-c">' + (l.listOffice ? "Listing courtesy of " + esc(l.listOffice) : "Listed on the MLS") + (l.mlsNumber ? " · MLS# " + esc(l.mlsNumber) : "") + "</span>"
      + '<button type="button" class="bx-btn bx-btn--sm" data-home="' + i + '">Request a showing</button></div></div></article>';
  };
  C.askHome = function (l) {
    var BL = window.BL;
    if (!BL) return;
    BL.requestShowingFor({ title: l.address + (l.city ? ", " + l.city : ""), meta: C.money(l.price), link: l.url || (l.mlsNumber ? "MLS# " + l.mlsNumber : ""), source: "Listing — Request a showing" });
  };
  C.searchCard = function (url, wide) {
    return '<a class="bx-search bx-rv' + (wide ? " bx-search--wide" : "") + '" href="' + esc(url || "https://bridgesglobal.co") + '" target="_blank" rel="noopener"><span class="bx-eyebrow">Stellar MLS search</span>'
      + "<b>Every home for sale in Tampa Bay.</b><span>Live MLS data, updated throughout the day — save searches and get new listings first.</span>"
      + '<span class="bx-btn bx-btn--gold">Search every MLS home ' + ARROW + "</span></a>";
  };

  /** Placeholder cards with the real cards' proportions, so the grid doesn't jump when data lands. */
  C.skeleton = function (kind, n) {
    var one = kind === "home"
      ? '<div class="bx-home bx-skel" aria-hidden="true"><div class="bx-media bx-r-43"></div><div class="bx-home-b"><i style="width:44%;height:26px"></i><i style="width:70%"></i><i style="width:52%"></i><i style="width:60%"></i><div class="bx-home-f"><i style="width:80%"></i><i style="height:42px;border-radius:999px"></i></div></div></div>'
      : '<div class="bx-tour bx-skel" aria-hidden="true"><div class="bx-media bx-r-169"></div><div class="bx-tour-b"><i style="width:36%"></i><i style="width:88%;height:20px"></i><i style="width:62%;height:20px"></i><i style="width:24%"></i></div></div>';
    return new Array(n + 1).join(one);
  };

  // ------------------------------------------------------------ video lightbox
  C.play = function (v) {
    if (!v) return;
    if (v.platform === "tiktok" || !v.playable || (!v.embedUrl && !v.mediaUrl)) { window.open(v.permalink, "_blank", "noopener"); return; }
    var ov = document.createElement("div"); ov.className = "bx-lb"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    var vertical = v.platform === "instagram" || v.platform === "tiktok";
    ov.innerHTML = '<div class="bx-lb-in' + (vertical ? " v" : "") + '"><button class="bx-lb-x" type="button" aria-label="Close">×</button><div class="bx-lb-f"></div>'
      + '<div class="bx-lb-m"><div><span class="bx-tour-k">' + esc(v.platformLabel) + (v.publishedAt ? " · " + C.date(v.publishedAt) : "") + "</span><b>" + esc(v.title) + "</b></div>"
      + '<button type="button" class="bx-btn bx-btn--gold bx-btn--sm" data-lb-ask>Request a showing</button></div></div>';
    var f = ov.querySelector(".bx-lb-f"), n;
    if (v.mediaUrl && !v.embedUrl) { n = document.createElement("video"); n.src = v.mediaUrl; n.controls = true; n.autoplay = true; n.playsInline = true; if (v.thumbnail) n.poster = v.thumbnail; }
    else { n = document.createElement("iframe"); var u = v.embedUrl; n.src = u + (u.indexOf("?") > 0 ? "&" : "?") + (v.platform === "youtube" ? "autoplay=1&playsinline=1&rel=0" : "autoplay=true"); n.allow = "autoplay; fullscreen; picture-in-picture"; n.allowFullscreen = true; }
    f.appendChild(n);
    function close() { ov.remove(); document.removeEventListener("keydown", key); document.documentElement.style.overflow = ""; }
    function key(e) { if (e.key === "Escape") close(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".bx-lb-x").onclick = close;
    ov.querySelector("[data-lb-ask]").onclick = function () {
      close();
      if (window.BL) window.BL.requestShowingFor({ title: v.title, meta: v.platformLabel + " video", link: v.permalink, source: "Video — Request a showing" });
    };
    document.addEventListener("keydown", key);
    document.documentElement.style.overflow = "hidden";
    document.body.appendChild(ov);
  };

  C.notifyLive = function (source) {
    if (window.BL) window.BL.requestShowingFor({ heading: "Get notified when we go live", title: "One message when the next live tour starts — nothing else.", button: "Notify me", notify: true, source: source || "Website — notify me when live" });
  };
})();
