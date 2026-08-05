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
  /* działa na text-node'ach (każdy dostaje tymczasowy wrapper, po animacji
     wraca oryginalny node — zagnieżdżone elementy przeżywają bez zmian).
     Każdy znak ma własny losowy start/koniec, losuje SYMBOLE z zestawu,
     a wylosowany znak („dud") świeci kolorem akcentu. */
  var CHARS = "!<>-_\\/[]{}—=+*^?#________";
  var CYCLE = 30; // co ile ms dud losuje nowy symbol (i jedyny takt zapisu DOM)
  var esc = function (s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var scramble = function (el) {
    if (el.__scrambling) return;
    el.__scrambling = true;
    var words = [];   // aktywne słowa wszystkich text-node'ów elementu
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === Node.TEXT_NODE && c.textContent.trim()) {
          /* DOM budowany RAZ, per SŁOWO: ukryty PRAWDZIWY tekst (scr-m)
             steruje layoutem — kerning, letter-spacing i text-wrap:balance
             identyczne jak w finale, więc nic nie drga ani się nie kurczy.
             Losowane symbole żyją na warstwie absolutnej (scr-v) nad słowem.
             Elementy custom scr-* — szerokie selektory strony (".x span")
             ich nie łapią. */
          var toks = c.textContent.split(/(\s+)/);
          var wrap = document.createElement("scr-t");
          wrap.innerHTML = toks.map(function (t) {
            return !t || /\s/.test(t) ? esc(t)
              : "<scr-w><scr-m>" + esc(t) + "</scr-m><scr-v></scr-v></scr-w>";
          }).join("");
          c.parentNode.replaceChild(wrap, c);
          var item = { node: c, wrap: wrap, left: 0 };
          var solid = toks.filter(function (t) { return t && !/\s/.test(t); });
          Array.prototype.forEach.call(wrap.querySelectorAll("scr-w"), function (w, j) {
            item.left++;
            words.push({
              el: w, v: w.lastChild, item: item,
              chars: solid[j].split("").map(function (ch) {
                var start = Math.random() * 350;
                return { ch: ch, start: start, end: start + 120 + Math.random() * 450 };
              }),
            });
          });
        } else if (c.nodeType === Node.ELEMENT_NODE && c.getAttribute("aria-hidden") !== "true") {
          walk(c); /* ikony/dekoracje (strzałki, +) nie są tekstem — nie losujemy ich */
        }
      });
    })(el);
    if (!words.length) { el.__scrambling = false; return; }
    var t0 = performance.now(), last = -CYCLE;
    var tick = function (now) {
      if (now - last >= CYCLE) { // zapis DOM tylko w takcie losowania, nie 60 fps
        last = now;
        var elapsed = document.hidden ? 1e9 : now - t0; // ukryta karta: dokończ natychmiast
        words = words.filter(function (w) {
          var html = "", done = 0;
          w.chars.forEach(function (q) {
            if (elapsed >= q.end) { html += esc(q.ch); done++; }
            else if (elapsed >= q.start) html += "<scr-d>" + esc(CHARS[(Math.random() * CHARS.length) | 0]) + "</scr-d>";
            else html += "<scr-h>" + esc(q.ch) + "</scr-h>";
          });
          if (done < w.chars.length) { w.v.innerHTML = html; return true; }
          /* słowo gotowe: odsłoń prawdziwy tekst; gdy cały text-node skończony —
             wraca oryginał (czysty DOM, identyczny layout) */
          w.el.className = "done";
          if (!--w.item.left) w.item.wrap.parentNode.replaceChild(w.item.node, w.item.wrap);
          return false;
        });
      }
      if (words.length) requestAnimationFrame(tick);
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
