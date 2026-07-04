/* SZRON — interakcje strony głównej */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── nawigacja: tło po scrollu ─────────────────────── */
  var nav = document.getElementById("nav");
  var onScroll = function () {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── menu mobilne ──────────────────────────────────── */
  var burger = document.querySelector(".nav__burger");
  var menu = document.getElementById("nav-menu");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      nav.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Zamknij menu" : "Otwórz menu");
    });
    menu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        menu.classList.remove("is-open");
        nav.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ── nagłówki: scramble jak na eyebrows ────────────── */
  /* .ws (h1/h2 hero i sekcji) + mniejsze nagłówki dostają rv + data-scramble */
  document
    .querySelectorAll(".ws, .card-tile h3, .step h3, .def-rows dt")
    .forEach(function (el) {
      el.classList.add("rv");
      el.setAttribute("data-scramble", "");
    });

  /* ── scramble (dekodowanie liter) ──────────────────── */
  /* działa na text-node'ach, więc nie niszczy zagnieżdżonych elementów
     (np. <small> w dt); czas skaluje się z długością tekstu */
  var CHARS = "abcdefghijklmnoprstuwyz0123456789";
  var KEEP = /[\s\/·.,–—:;?!()&+%]/;
  var scramble = function (el) {
    var nodes = [];
    var len = 0;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === Node.TEXT_NODE && c.textContent.trim()) {
          nodes.push({ node: c, orig: c.textContent });
          len += c.textContent.length;
        } else if (c.nodeType === Node.ELEMENT_NODE) {
          walk(c);
        }
      });
    })(el);
    if (!nodes.length) return;
    var frame = 0;
    var total = Math.max(24, Math.min(56, Math.round(len * 0.6)));
    var tick = function () {
      if (document.hidden) frame = total - 1; // ukryta karta: dokończ natychmiast
      frame++;
      var progress = frame / total;
      nodes.forEach(function (item) {
        var original = item.orig;
        var out = "";
        for (var i = 0; i < original.length; i++) {
          var ch = original[i];
          if (KEEP.test(ch) || i < original.length * progress) {
            out += ch;
          } else {
            out += CHARS[(Math.random() * CHARS.length) | 0];
          }
        }
        item.node.textContent = frame < total ? out : original;
      });
      if (frame < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* ── IntersectionObserver: reveals ─────────────────── */
  var targets = document.querySelectorAll(".rv, .ws");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) { el.classList.add("is-view"); });
    return;
  }
  var seen = new WeakSet();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting || seen.has(entry.target)) return;
      seen.add(entry.target);
      entry.target.classList.add("is-view");
      if (entry.target.hasAttribute("data-scramble")) scramble(entry.target);
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
  targets.forEach(function (el) { io.observe(el); });
})();
