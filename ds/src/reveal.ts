/**
 * Runtime animacji tekstu — wierny port public/js/main.js strony szron.tech:
 * auto-tagowanie wszystkich tekstowych „liści" (rv + data-scramble), reveal
 * przy wejściu na viewport z replay po pełnym wyjściu, scramble (dekodowanie
 * z losowych symboli w kolorze akcentu, styl monako.ai; per słowo — ukryty
 * prawdziwy tekst scr-m steruje layoutem, CSS scr-* w main.css strony).
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

const CHARS = '!<>-_\\/[]{}—=+*^?#________';
const CYCLE = 30; // co ile ms dud losuje nowy symbol (i jedyny takt zapisu DOM)

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

interface ScrItem { node: Text; wrap: HTMLElement; left: number }
interface ScrWord { el: HTMLElement; v: HTMLElement; item: ScrItem; chars: { ch: string; start: number; end: number }[] }

function scramble(el: HTMLElement & { __scrambling?: boolean }): void {
  if (el.__scrambling) return;
  el.__scrambling = true;
  let words: ScrWord[] = []; // aktywne słowa wszystkich text-node'ów elementu
  (function walk(n: Node) {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE && c.textContent && c.textContent.trim()) {
        /* DOM budowany RAZ, per SŁOWO: ukryty PRAWDZIWY tekst (scr-m) steruje
           layoutem — kerning, letter-spacing i text-wrap:balance identyczne
           jak w finale, więc nic nie drga ani się nie kurczy. Losowane symbole
           żyją na warstwie absolutnej (scr-v) nad słowem. Elementy custom
           scr-* — szerokie selektory strony (".x span") ich nie łapią. */
        const toks = c.textContent.split(/(\s+)/);
        const wrap = document.createElement('scr-t');
        wrap.innerHTML = toks
          .map((t) => (!t || /\s/.test(t) ? esc(t) : '<scr-w><scr-m>' + esc(t) + '</scr-m><scr-v></scr-v></scr-w>'))
          .join('');
        c.parentNode!.replaceChild(wrap, c);
        const item: ScrItem = { node: c as Text, wrap, left: 0 };
        const solid = toks.filter((t) => t && !/\s/.test(t));
        wrap.querySelectorAll('scr-w').forEach((w, j) => {
          item.left++;
          words.push({
            el: w as HTMLElement, v: w.lastChild as HTMLElement, item,
            chars: solid[j].split('').map((ch) => {
              const start = Math.random() * 350;
              return { ch, start, end: start + 120 + Math.random() * 450 };
            }),
          });
        });
      } else if (c.nodeType === Node.ELEMENT_NODE && (c as Element).getAttribute('aria-hidden') !== 'true') {
        walk(c); // ikony/dekoracje (strzałki, +) nie są tekstem — nie losujemy ich
      }
    }
  })(el);
  if (!words.length) { el.__scrambling = false; return; }
  const t0 = performance.now();
  let last = -CYCLE;
  const tick = (now: number) => {
    if (now - last >= CYCLE) { // zapis DOM tylko w takcie losowania, nie 60 fps
      last = now;
      const elapsed = document.hidden ? 1e9 : now - t0; // ukryta karta: dokończ natychmiast
      words = words.filter((w) => {
        let html = '';
        let done = 0;
        for (const q of w.chars) {
          if (elapsed >= q.end) { html += esc(q.ch); done++; }
          else if (elapsed >= q.start) html += '<scr-d>' + esc(CHARS[(Math.random() * CHARS.length) | 0]) + '</scr-d>';
          else html += '<scr-h>' + esc(q.ch) + '</scr-h>';
        }
        if (done < w.chars.length) { w.v.innerHTML = html; return true; }
        /* słowo gotowe: odsłoń prawdziwy tekst; gdy cały text-node skończony —
           wraca oryginał (czysty DOM, identyczny layout) */
        w.el.className = 'done';
        if (!--w.item.left) w.item.wrap.parentNode!.replaceChild(w.item.node, w.item.wrap);
        return false;
      });
    }
    if (words.length) requestAnimationFrame(tick);
    else el.__scrambling = false;
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
