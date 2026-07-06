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

  /* ── scramble na wszystkich tekstach ───────────────── */
  /* wszystkie blokowe elementy tekstowe; animujemy tylko "liście" (bez
     zagnieżdżonych bloków), żeby te same text-node'y nie miały dwóch
     konkurujących animacji; nav pomijamy — jest widoczny od startu */
  var SCRAMBLE_SEL =
    "h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, summary, th, td";
  document.querySelectorAll(SCRAMBLE_SEL).forEach(function (el) {
    if (el.closest("nav")) return;
    if (el.querySelector(SCRAMBLE_SEL)) return;
    el.classList.add("rv");
    el.setAttribute("data-scramble", "");
  });
  document.querySelectorAll(".ws").forEach(function (el) {
    el.classList.add("rv");
    el.setAttribute("data-scramble", "");
  });

  /* ── scramble (dekodowanie liter) ──────────────────── */
  /* działa na text-node'ach, więc nie niszczy zagnieżdżonych elementów
     (np. <small> w dt); czas skaluje się z długością tekstu */
  var KEEP = /[\s\/·.,–—:;?!()&+%]/;
  /* losowa litera o zbliżonej szerokości i tej samej wielkości — żeby słowa
     nie zmieniały szerokości w trakcie animacji i tekst się nie przełamywał */
  var SETS = {
    narrow: "ijltfr",
    wide: "mw",
    regular: "abcdenoshkuvyz",
    digit: "0123456789",
  };
  var randLike = function (ch) {
    var lower = ch.toLowerCase();
    var set;
    if (/[0-9]/.test(ch)) set = SETS.digit;
    else if (SETS.narrow.indexOf(lower) !== -1) set = SETS.narrow;
    else if (SETS.wide.indexOf(lower) !== -1) set = SETS.wide;
    else set = SETS.regular;
    var out = set[(Math.random() * set.length) | 0];
    return ch === ch.toUpperCase() && ch !== lower ? out.toUpperCase() : out;
  };
  var scramble = function (el) {
    if (el.__scrambling) return;
    el.__scrambling = true;
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
    if (!nodes.length) { el.__scrambling = false; return; }
    // twarda blokada wysokości + overflow na czas animacji — losowe litery mają
    // inne szerokości, więc bez tego zmienia się liczba linii i wszystko
    // poniżej się trzęsie (minHeight nie wystarcza, gdy tekst łamie się SZERZEJ)
    el.style.height = el.offsetHeight + "px";
    el.style.overflow = "hidden";
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
            out += randLike(ch);
          }
        }
        item.node.textContent = frame < total ? out : original;
      });
      if (frame < total) requestAnimationFrame(tick);
      else { el.style.height = ""; el.style.overflow = ""; el.__scrambling = false; }
    };
    requestAnimationFrame(tick);
  };

  /* ── IntersectionObserver: reveals ─────────────────── */
  var targets = document.querySelectorAll(".rv, .ws");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) { el.classList.add("is-view"); });
    return;
  }
  /* replay: animacja odpala się przy KAŻDYM wejściu elementu w viewport —
     po pełnym wyjściu z ekranu (góra lub dół) element się „uzbraja" ponownie */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var el = entry.target;
      if (entry.isIntersecting) {
        if (el.classList.contains("is-view")) return;
        el.classList.add("is-view");
        if (el.hasAttribute("data-scramble")) scramble(el);
      } else {
        var r = entry.boundingClientRect;
        if (r.bottom < 0 || r.top > window.innerHeight) el.classList.remove("is-view");
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
  targets.forEach(function (el) { io.observe(el); });
})();

/* SZRON — powiadomienia email z formularzy (Resend przez Supabase Edge Function).
   Nie przerywa natywnego POST do Netlify Forms (archiwum zgłoszeń) — fetch keepalive leci równolegle. */
(function () {
  "use strict";
  /* Netlify po przetworzeniu usuwa data-netlify z serwowanego HTML — łapiemy po name. */
  ["kontakt", "umow-rozmowe", "darmowy-audyt"].forEach(function (name) {
    var form = document.querySelector('form[name="' + name + '"]');
    if (!form) return;
    form.addEventListener("submit", function () {
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      /* sendBeacon zamiast fetch: keepalive z JSON-em wymaga preflightu CORS,
         który Chrome ubija przy nawigacji — beacon (text/plain) przeżywa unload. */
      try {
        navigator.sendBeacon(
          "https://sttluvcbucpxzbcsuigw.supabase.co/functions/v1/szron-site-form",
          new Blob([JSON.stringify({ form: name, data: data })], { type: "text/plain" })
        );
      } catch (e) { /* email jest best-effort; zgłoszenie i tak zapisuje Netlify */ }
    });
  });
})();
