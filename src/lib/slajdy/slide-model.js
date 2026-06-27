// Model sceny slajdu (scene graph) — edytor obiektowy v2.
// Współrzędne w STAŁEJ przestrzeni 1920×1080; render skaluje całość transformem.
// `content` (jsonb) jest źródłem prawdy; `text`/`image_url` w DB to zdenormalizowany cache.

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;
export const CONTENT_VERSION = 1;

let _idc = 0;
export function genId() {
  return 'o_' + (Date.now().toString(36) + (_idc++).toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-9);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// tekst → bezpieczny HTML (akapity przez <br>)
export function textToHtml(t) {
  const v = String(t ?? '');
  if (!v) return '';
  return esc(v).replace(/\n/g, '<br>');
}
// HTML → czysty tekst (do cache `text` / miniatur poza edytorem)
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>(?!$)/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── sanitizer rich-text (allowlista) — czyści HTML z contenteditable przed zapisem ──
const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'SPAN', 'DIV', 'A']);
const ALLOWED_STYLE = ['color', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align'];
const TAG_MAP = { STRONG: 'b', EM: 'i', DIV: 'div' };
function cleanStyle(value) {
  return String(value || '').split(';').map((s) => s.trim()).filter(Boolean)
    .filter((s) => ALLOWED_STYLE.includes(s.split(':')[0].trim().toLowerCase()))
    .join('; ');
}
function cleanInto(src, dst) {
  src.childNodes.forEach((node) => {
    if (node.nodeType === 3) { dst.appendChild(document.createTextNode(node.nodeValue)); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (!ALLOWED_TAGS.has(tag)) { cleanInto(node, dst); return; } // niedozwolony → rozwiń dzieci
    const el = document.createElement(TAG_MAP[tag] || tag.toLowerCase());
    const st = cleanStyle(node.getAttribute && node.getAttribute('style'));
    if (st) el.setAttribute('style', st);
    if (tag === 'A') { const href = node.getAttribute('href'); if (href && /^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); } }
    cleanInto(node, el);
    dst.appendChild(el);
  });
}
// Oczyść HTML do dozwolonego podzbioru (do zapisu w richText). Wymaga DOM (browser).
export function sanitizeHtml(html) {
  if (typeof document === 'undefined') return String(html || '');
  const body = new DOMParser().parseFromString(String(html || ''), 'text/html').body;
  const out = document.createElement('div');
  cleanInto(body, out);
  return out.innerHTML;
}

// Domyślny obiekt danego typu (px w przestrzeni 1920×1080).
export function newObject(type, props = {}) {
  const base = {
    id: genId(), type,
    x: 360, y: 440, w: 1200, h: 200,
    rotation: 0, z: 0, opacity: 1, locked: false,
  };
  if (type === 'text') Object.assign(base, {
    richText: '', font: 'helvetica', size: 72, color: '#ffffff',
    align: 'center', valign: 'middle', weight: 500, lineHeight: 1.18, bg: null, autoHeight: false,
  });
  if (type === 'image') Object.assign(base, { src: '', fit: 'cover', radius: 0, naturalW: 0, naturalH: 0, alt: '' });
  if (type === 'shape') Object.assign(base, { kind: 'rect', fill: '#f97316', stroke: null, radius: 12 });
  return Object.assign(base, props);
}

export function emptyContent() {
  return { version: CONTENT_VERSION, background: { type: 'none' }, objects: [] };
}

// Normalizacja + wersjonowanie istniejącego dokumentu.
export function migrateContent(content) {
  if (!content || typeof content !== 'object' || !Array.isArray(content.objects)) return emptyContent();
  const bg = content.background && typeof content.background === 'object' ? content.background : { type: 'none' };
  const objects = content.objects.map((o, i) => ({ ...o, z: Number.isFinite(o.z) ? o.z : i }))
    .sort((a, b) => a.z - b.z)
    .map((o, i) => ({ ...o, z: i }));
  return { version: CONTENT_VERSION, background: bg, objects, transition: content.transition || 'none' };
}

// Lazy-migracja: wiersz DB (legacy text/image_url) → dokument sceny.
// Legacy `image_url` był pełnoekranowym tłem slajdu (object-fit:contain) → background.image.
// Legacy `text` był wyśrodkowanym blokiem → jeden obiekt text na całym slajdzie.
export function slideToContent(row) {
  if (row && row.content) return migrateContent(row.content);
  const background = row && row.image_url
    ? { type: 'image', value: row.image_url, fit: 'contain' }
    : { type: 'none' };
  // Każdy slajd dostaje jeden edytowalny obiekt tekstowy (parytet z dzisiejszą nakładką;
  // pusty dla slajdów-obrazów). Scrim pod tekstem tylko gdy jest treść NA obrazie.
  const text = (row && row.text || '').trim();
  const objects = [newObject('text', {
    x: 80, y: 0, w: SLIDE_W - 160, h: SLIDE_H,
    align: 'center', valign: 'middle', size: 96, weight: 500, color: '#ffffff',
    lineHeight: 1.18, richText: textToHtml(row && row.text),
    bg: (row && row.image_url && text) ? 'rgba(0,0,0,0.45)' : null,
    z: 0,
  })];
  return { version: CONTENT_VERSION, background, objects, transition: 'none' };
}

// Pochodne do zapisu w DB (cache): pierwszy tekst + pierwszy obraz/tło.
export function deriveText(content) {
  return (content.objects || [])
    .filter((o) => o.type === 'text')
    .map((o) => htmlToText(o.richText)).filter(Boolean).join('\n').slice(0, 500);
}
export function deriveImage(content) {
  if (content.background && content.background.type === 'image') return content.background.value || null;
  const img = (content.objects || []).find((o) => o.type === 'image' && o.src);
  return img ? img.src : null;
}
// Patch do `training_slides.update(...)` — content + pochodne.
export function contentToPatch(content) {
  return { content, text: deriveText(content), image_url: deriveImage(content) };
}
