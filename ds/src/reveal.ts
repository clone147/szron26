/**
 * Runtime animacji tekstu — wierny port public/js/main.js strony szron.tech:
 * auto-tagowanie wszystkich tekstowych „liści" (rv + data-scramble), reveal
 * przy wejściu na viewport z replay po pełnym wyjściu, scramble (dekodowanie
 * losowych liter o zbliżonej szerokości) z twardą blokadą wysokości.
 *
 * Adaptacje pod DS (reszta 1:1 ze stroną):
 * - `html.rv-armed` — do czasu uzbrojenia CSS trzyma treść widoczną, więc
 *   render bez JS nigdy nie ukrywa tekstu;
 * - `navigator.webdriver` (headless capture) → bez animacji, wszystko widoczne;
 * - MutationObserver — React montuje komponenty po inicjalizacji.
 */

const BLOCK_SEL =
  'h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, summary, th, td';
const INLINE_SEL =
  'a, button, span, strong, em, b, small, label, legend, caption, address';
const SCRAMBLE_SEL = BLOCK_SEL + ', ' + INLINE_SEL;

/* jak na stronie: WSZYSTKIE obiekty tekstowe (bloki + przyciski/linki/spany);
   jeden animator na poddrzewo — kontener z blokiem w środku i element pod już
   otagowanym przodkiem są pomijane; nav widoczny od startu */
function tag(root: ParentNode): void {
  root.querySelectorAll(SCRAMBLE_SEL).forEach((el) => {
    if (el.closest('nav')) return;
    if (el.closest('[aria-hidden="true"]')) return;
    if (el.querySelector(BLOCK_SEL)) return;
    if (el.parentElement?.closest('[data-scramble]')) return;
    if (!el.textContent || !el.textContent.trim()) return;
    el.classList.add('rv');
    el.setAttribute('data-scramble', '');
  });
  root.querySelectorAll('.ws').forEach((el) => {
    el.classList.add('rv');
    el.setAttribute('data-scramble', '');
  });
}

const KEEP = /[\s\/·.,–—:;?!()&+%]/;
/* losowa litera o zbliżonej szerokości i tej samej wielkości — żeby słowa
   nie zmieniały szerokości w trakcie animacji i tekst się nie przełamywał */
const SETS: Record<string, string> = {
  narrow: 'ijltfr',
  wide: 'mw',
  regular: 'abcdenoshkuvyz',
  digit: '0123456789',
};

function randLike(ch: string): string {
  const lower = ch.toLowerCase();
  let set: string;
  if (/[0-9]/.test(ch)) set = SETS.digit;
  else if (SETS.narrow.indexOf(lower) !== -1) set = SETS.narrow;
  else if (SETS.wide.indexOf(lower) !== -1) set = SETS.wide;
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
        // ikony/dekoracje (⤢, +, strzałki) nie są tekstem — nie losujemy ich
        if ((c as Element).getAttribute('aria-hidden') === 'true') continue;
        walk(c);
      }
    }
  })(el);
  if (!nodes.length) { el.__scrambling = false; return; }
  // twarda blokada wysokości + overflow na czas animacji — losowe litery mają
  // inne szerokości, więc bez tego zmienia się liczba linii i wszystko
  // poniżej się trzęsie (minHeight nie wystarcza, gdy tekst łamie się SZERZEJ)
  el.style.height = el.offsetHeight + 'px';
  el.style.overflow = 'hidden';
  let frame = 0;
  const total = Math.max(24, Math.min(56, Math.round(len * 0.6)));
  const tick = () => {
    if (document.hidden) frame = total - 1; // ukryta karta: dokończ natychmiast
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

function start(): void {
  tag(document);
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          if (el.classList.contains('is-view')) continue;
          el.classList.add('is-view');
          if (el.hasAttribute('data-scramble')) scramble(el);
        } else {
          /* replay: po pełnym wyjściu z ekranu element „uzbraja się" ponownie */
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
  // React montuje komponenty po inicjalizacji — taguj i obserwuj nowe poddrzewa
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of Array.from(m.addedNodes)) {
        if (n.nodeType !== Node.ELEMENT_NODE) continue;
        const el = n as HTMLElement;
        if (el.closest('.rv')) continue; // wnętrze animowanego liścia (scramble podmienia text-nodes)
        tag(el);
        if (el.matches?.('.rv, .ws')) io.observe(el);
        observe(el);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function init(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof IntersectionObserver === 'undefined') return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || (navigator as any).webdriver) return; // treść widoczna, bez animacji
  const kick = () => (document.body ? start() : addEventListener('DOMContentLoaded', start, { once: true }));
  kick();
}

init();
