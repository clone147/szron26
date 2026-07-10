/**
 * Runtime animacji reveal-on-scroll — port public/js/main.js strony szron.tech.
 *
 * Różnica wobec strony: animacje uzbrajają się dopiero przy pierwszej interakcji
 * (scroll/wheel/touch). Do tego czasu CSS `html:not(.rv-armed) .rv` trzyma wszystko
 * widoczne — treść nigdy nie ginie w renderze statycznym (screenshoty, brak JS),
 * a elementy wjeżdżające na viewport przy scrollu animują się jak na stronie
 * (replay przy każdym pełnym wyjściu z ekranu; nagłówki .ws z data-scramble
 * dostają efekt „scramble" liter).
 */

const KEEP = /[\s.,:;!?()—–-]/;
const SETS: Record<string, string> = {
  narrow: 'iljt',
  wide: 'mw',
  regular: 'abcdenoshkuvyz',
  digit: '0123456789',
};

function randLike(ch: string): string {
  const lower = ch.toLowerCase();
  let set: string;
  if (/[0-9]/.test(ch)) set = SETS.digit;
  else if (SETS.narrow.includes(lower)) set = SETS.narrow;
  else if (SETS.wide.includes(lower)) set = SETS.wide;
  else set = SETS.regular;
  const out = set[(Math.random() * set.length) | 0];
  return ch === ch.toUpperCase() && ch !== lower ? out.toUpperCase() : out;
}

function scramble(el: HTMLElement & { __scrambling?: boolean }): void {
  if (el.__scrambling) return;
  el.__scrambling = true;
  const nodes: { node: Text; orig: string }[] = [];
  let len = 0;
  (function walk(n: Node) {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE && c.textContent && c.textContent.trim()) {
        nodes.push({ node: c as Text, orig: c.textContent });
        len += c.textContent.length;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        walk(c);
      }
    }
  })(el);
  if (!nodes.length) { el.__scrambling = false; return; }
  // twarda blokada wysokości + overflow na czas animacji — losowe litery mają
  // inne szerokości, więc bez tego zmienia się liczba linii (jak na stronie)
  el.style.height = el.offsetHeight + 'px';
  el.style.overflow = 'hidden';
  let frame = 0;
  const total = Math.max(24, Math.min(56, Math.round(len * 0.6)));
  const tick = () => {
    if (document.hidden) frame = total - 1;
    frame++;
    const progress = frame / total;
    for (const item of nodes) {
      const original = item.orig;
      let out = '';
      for (let i = 0; i < original.length; i++) {
        const ch = original[i];
        out += KEEP.test(ch) || i < original.length * progress ? ch : randLike(ch);
      }
      item.node.textContent = frame < total ? out : original;
    }
    if (frame < total) requestAnimationFrame(tick);
    else { el.style.height = ''; el.style.overflow = ''; el.__scrambling = false; }
  };
  requestAnimationFrame(tick);
}

let armed = false;

function arm(): void {
  if (armed || typeof IntersectionObserver === 'undefined') return;
  armed = true;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          if (el.classList.contains('is-view')) continue;
          el.classList.add('is-view');
          if (el.hasAttribute('data-scramble')) scramble(el);
        } else {
          const r = entry.boundingClientRect;
          if (r.bottom < 0 || r.top > window.innerHeight) el.classList.remove('is-view');
        }
      }
      // pierwszy batch oznaczył elementy w viewporcie — dopiero teraz chowamy resztę
      document.documentElement.classList.add('rv-armed');
    },
    { rootMargin: '0px 0px -8% 0px', threshold: [0, 0.1] }
  );
  const observe = (root: ParentNode) =>
    root.querySelectorAll('.rv, .ws').forEach((el) => io.observe(el));
  observe(document);
  // React montuje komponenty po inicjalizacji — obserwuj też nowe węzły
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of Array.from(m.addedNodes)) {
        if (n.nodeType !== Node.ELEMENT_NODE) continue;
        const el = n as HTMLElement;
        if (el.matches?.('.rv, .ws')) io.observe(el);
        observe(el);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function init(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return; // bramka CSS trzyma wszystko widoczne — nic nie animujemy
  const once = { once: true, passive: true } as AddEventListenerOptions;
  window.addEventListener('scroll', arm, once);
  window.addEventListener('wheel', arm, once);
  window.addEventListener('touchstart', arm, once);
}

init();
