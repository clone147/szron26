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
  /* WSZYSTKIE obiekty tekstowe — bloki + przyciski, linki, spany w boxach.
     Zasada „jeden animator na poddrzewo": kontener z zagnieżdżonym blokiem
     nie jest tagowany (animują się liście), a element, którego przodek już
     dostał data-scramble, jest pomijany (scramble i tak animuje jego
     text-node'y — dwóch konkurujących animacji być nie może);
     nav pomijamy — jest widoczny od startu */
  var BLOCK_SEL =
    "h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, summary, th, td";
  var INLINE_SEL =
    "a, button, span, strong, em, b, small, label, legend, caption, address";
  var SCRAMBLE_SEL = BLOCK_SEL + ", " + INLINE_SEL;
  document.querySelectorAll(SCRAMBLE_SEL).forEach(function (el) {
    if (el.closest("nav")) return;
    if (el.closest('[aria-hidden="true"]')) return;
    if (el.querySelector(BLOCK_SEL)) return;
    if (el.parentElement && el.parentElement.closest("[data-scramble]")) return;
    if (!el.textContent.trim()) return;
    el.classList.add("rv");
    el.setAttribute("data-scramble", "");
  });
  document.querySelectorAll(".ws").forEach(function (el) {
    el.classList.add("rv");
    el.setAttribute("data-scramble", "");
  });

  /* ── scramble (dekodowanie znaków, styl monako.ai) ─── */
  /* działa na text-node'ach (każdy dostaje tymczasowy <span>, po animacji
     wraca oryginalny node — zagnieżdżone elementy przeżywają bez zmian).
     Każdy znak ma własny losowy start/koniec, losuje SYMBOLE z zestawu,
     a wylosowany znak („dud") świeci kolorem akcentu. Szerokość stabilizują
     komórki: niewidoczny znak docelowy (::before) nadaje wymiar, symbol jest
     pozycjonowany absolutnie i wycentrowany — zero przełamań tekstu. */
  var CHARS = "!<>-_\\/[]{}—=+*^?#________";
  var CYCLE = 30;      // co ile ms dud losuje nowy symbol
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  /* elementy custom (scr-c/scr-v/scr-w) zamiast <span> — szerokie selektory
     strony w stylu ".case-card__stats span { display:block }" nie mogą łapać
     wstrzykiwanych wrapperów animacji (litera-per-wiersz) */
  var cell = function (measure, inner, dud) {
    return '<scr-c data-m="' + esc(measure) + '">' +
      "<scr-v" + (dud ? ' class="scramble-dud"' : "") + ">" +
      inner + "</scr-v></scr-c>";
  };
  var scramble = function (el) {
    if (el.__scrambling) return;
    el.__scrambling = true;
    var nodes = [];
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === Node.TEXT_NODE && c.textContent.trim()) {
          nodes.push({ node: c, orig: c.textContent });
        } else if (c.nodeType === Node.ELEMENT_NODE) {
          /* ikony/dekoracje (⤢, +, strzałki) nie są tekstem — nie losujemy ich */
          if (c.getAttribute("aria-hidden") === "true") return;
          walk(c);
        }
      });
    })(el);
    if (!nodes.length) { el.__scrambling = false; return; }
    nodes.forEach(function (item) {
      item.queue = [];
      for (var i = 0; i < item.orig.length; i++) {
        var start = Math.random() * 350;
        item.queue.push({
          ch: item.orig[i],
          start: start,
          end: start + 120 + Math.random() * 450,
          sym: null,
          nextAt: 0,
        });
      }
      /* text-node → tymczasowy wrapper, żeby dudy mogły dostać kolor */
      item.span = document.createElement("scr-t");
      item.node.parentNode.replaceChild(item.span, item.node);
      item.done = false;
    });
    var t0 = performance.now();
    var tick = function (now) {
      var elapsed = document.hidden ? 1e9 : now - t0; // ukryta karta: dokończ natychmiast
      var pending = false;
      nodes.forEach(function (item) {
        if (item.done) return;
        var html = "";
        var word = false;   // grupowanie komórek w <scr-w> (nowrap)
        var resolved = 0;
        item.queue.forEach(function (q) {
          if (/\s/.test(q.ch)) {
            if (word) { html += "</scr-w>"; word = false; }
            resolved++;
            html += q.ch;
            return;
          }
          if (!word) { html += "<scr-w>"; word = true; }
          if (elapsed >= q.end) {
            resolved++;
            html += cell(q.ch, esc(q.ch), false);
          } else if (elapsed >= q.start) {
            if (!q.sym || elapsed >= q.nextAt) {
              q.sym = CHARS[(Math.random() * CHARS.length) | 0];
              q.nextAt = elapsed + CYCLE;
            }
            html += cell(q.ch, esc(q.sym), true);
          } else {
            html += cell(q.ch, "&nbsp;", false);
          }
        });
        if (word) html += "</scr-w>";
        if (resolved === item.queue.length) {
          /* gotowe: przywróć oryginalny text-node — DOM wraca do stanu sprzed animacji */
          item.span.parentNode.replaceChild(item.node, item.span);
          item.done = true;
        } else {
          item.span.innerHTML = html;
          pending = true;
        }
      });
      if (pending) requestAnimationFrame(tick);
      else el.__scrambling = false;
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
  }, { rootMargin: "0px 0px -8% 0px", threshold: [0, 0.1] });
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
