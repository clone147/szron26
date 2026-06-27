// Wspólny renderer slajdu (edytor / miniatury / prezentacja).
// Renderuje wnętrze `.slide-stage` (warstwa tła + obiekty) w przestrzeni 1920×1080.
// Skalowanie do viewportu = jeden transform: scale na `.slide-stage`.
import { SLIDE_W, SLIDE_H } from './slide-model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FONT_STACKS = {
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  display: 'var(--font-display)',
  body: 'var(--font-body)',
};
const ALIGN_JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' };
const VALIGN_ITEMS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

// HTML warstwy tła slajdu. deckBg = gotowa wartość CSS `background` (kolor lub url decku).
function bgHtml(content, deckBg) {
  const bg = (content && content.background) || { type: 'none' };
  if (bg.type === 'image' && bg.value) {
    return `<div class="slide-bg" style="background:#000">`
      + `<img class="slide-bg__img" src="${esc(bg.value)}" alt="" style="object-fit:${bg.fit === 'cover' ? 'cover' : 'contain'}"></div>`;
  }
  const color = bg.type === 'color' ? esc(bg.value) : (deckBg || 'var(--color-ink)');
  return `<div class="slide-bg" style="background:${color}"></div>`;
}

function textStyle(o) {
  const fam = FONT_STACKS[o.font] || FONT_STACKS.helvetica;
  return [
    `font-family:${fam}`,
    `font-size:${o.size || 72}px`,
    `font-weight:${o.weight || 500}`,
    `color:${esc(o.color || '#ffffff')}`,
    `line-height:${o.lineHeight || 1.18}`,
    `text-align:${o.align || 'center'}`,
    o.bg ? `background:${esc(o.bg)};padding:.35em .6em;border-radius:.18em` : '',
  ].filter(Boolean).join(';');
}

export function renderObject(o, { editable = false } = {}) {
  const box = `position:absolute;left:0;top:0;width:${o.w}px;height:${o.h}px;`
    + `transform:translate(${o.x}px,${o.y}px) rotate(${o.rotation || 0}deg);opacity:${o.opacity ?? 1};z-index:${o.z || 0};`;
  if (o.type === 'text') {
    const ce = editable ? ' contenteditable="true" data-edit="text"' : '';
    return `<div class="slide-obj slide-obj--text" data-id="${o.id}" style="${box}align-items:${VALIGN_ITEMS[o.valign] || 'center'};justify-content:${ALIGN_JUSTIFY[o.align] || 'center'}">`
      + `<div class="slide-obj__text" style="${textStyle(o)}"${ce} data-ph="Tekst…">${o.richText || ''}</div></div>`;
  }
  if (o.type === 'image') {
    return `<div class="slide-obj slide-obj--image" data-id="${o.id}" style="${box}">`
      + `<img src="${esc(o.src)}" alt="${esc(o.alt || '')}" style="width:100%;height:100%;object-fit:${o.fit === 'contain' ? 'contain' : 'cover'};border-radius:${o.radius || 0}px"></div>`;
  }
  if (o.type === 'shape') {
    const fill = o.fill ? esc(o.fill) : 'transparent';
    const stroke = o.stroke ? `border:${o.stroke.width || 2}px solid ${esc(o.stroke.color || '#fff')};` : '';
    const rad = o.kind === 'ellipse' ? '50%' : `${o.radius || 0}px`;
    return `<div class="slide-obj slide-obj--shape" data-id="${o.id}" style="${box}background:${fill};${stroke}border-radius:${rad}"></div>`;
  }
  return '';
}

// Wnętrze `.slide-stage` (string): warstwa tła + obiekty wg z.
export function renderSlideInner(content, { deckBg, editable = false } = {}) {
  const objs = (content.objects || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0))
    .map((o) => renderObject(o, { editable })).join('');
  return bgHtml(content, deckBg) + objs;
}

// Ustawia skalę `.slide-stage` tak, by 1920×1080 wypełniło viewport (16:9). Zwraca skalę.
export function applyScale(viewportEl, stageEl) {
  if (!viewportEl || !stageEl) return 1;
  const w = viewportEl.clientWidth;
  const s = w / SLIDE_W;
  stageEl.style.transform = `scale(${s})`;
  viewportEl.dataset.scale = String(s);
  return s;
}

// Tworzy/aktualizuje strukturę .slide-viewport>.slide-stage w `hostEl` i renderuje content.
// Zwraca { stage, observer } — observer trzeba disconnect() przy odmontowaniu.
export function mountSlide(hostEl, content, opts = {}) {
  const hasBgImg = content && content.background && content.background.type === 'image';
  hostEl.innerHTML = `<div class="slide-stage${hasBgImg ? ' has-bg-image' : ''}" style="width:${SLIDE_W}px;height:${SLIDE_H}px">${renderSlideInner(content, opts)}</div>`;
  const stage = hostEl.querySelector('.slide-stage');
  applyScale(hostEl, stage);
  let observer = null;
  if (opts.observe !== false && 'ResizeObserver' in window) {
    observer = new ResizeObserver(() => applyScale(hostEl, stage));
    observer.observe(hostEl);
  }
  return { stage, observer };
}
