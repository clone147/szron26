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

  /* ── nagłówki: podział na słowa (reveal słowo po słowie) ── */
  document.querySelectorAll(".ws").forEach(function (el) {
    if (reduceMotion) return;
    var delay = 0;
    var splitNode = function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(" "));
            return;
          }
          var w = document.createElement("span");
          w.className = "w";
          var inner = document.createElement("span");
          inner.textContent = part;
          inner.style.transitionDelay = delay.toFixed(2) + "s";
          delay += 0.06;
          w.appendChild(inner);
          frag.appendChild(w);
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        Array.prototype.slice.call(node.childNodes).forEach(splitNode);
      }
    };
    Array.prototype.slice.call(el.childNodes).forEach(splitNode);
  });

  /* ── scramble na eyebrows ──────────────────────────── */
  var CHARS = "abcdefghijklmnoprstuwyz0123456789";
  var scramble = function (el) {
    var original = el.textContent;
    var frame = 0;
    var total = 16;
    var tick = function () {
      frame++;
      var progress = frame / total;
      var out = "";
      for (var i = 0; i < original.length; i++) {
        var ch = original[i];
        if (ch === " " || ch === "/" || ch === "·" || i < original.length * progress) {
          out += ch;
        } else {
          out += CHARS[(Math.random() * CHARS.length) | 0];
        }
      }
      el.textContent = out;
      if (frame < total) requestAnimationFrame(tick);
      else el.textContent = original;
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
