// Kontroler interakcji edytora obiektów.
// Drag ciała obiektu: własny handler pointer (kontrola skali + snapping do osi/krawędzi slajdu i innych obiektów).
// Skala/rotacja: Moveable (uchwyty + snapping). Edycja tekstu: dwuklik.
import Moveable from 'moveable';
import { SLIDE_W, SLIDE_H, textToHtml } from './slide-model.js';

const parseTransform = (t) => {
  const tx = /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/.exec(t || '');
  const rot = /rotate\(\s*([-\d.]+)deg\s*\)/.exec(t || '');
  return { x: tx ? +tx[1] : 0, y: tx ? +tx[2] : 0, rot: rot ? +rot[1] : 0 };
};
const SNAP = 10; // próg snappingu w przestrzeni 1920

// opts: { host (.slide-viewport), getSlide()→{content}, commit()→zapis+historia, onSelect(model|null) }
export function createObjectEditor(opts) {
  const { host, getSlide, commit, onSelect } = opts;
  const container = host.parentElement; // .deck-canvas-wrap (position:relative w CSS)
  let moveable = null;
  let selectedId = null;
  let editingId = null;
  let drag = null;

  const stage = () => host.querySelector('.slide-stage');
  const elOf = (id) => stage()?.querySelector(`.slide-obj[data-id="${id}"]`);
  const modelOf = (id) => (getSlide()?.content.objects || []).find((o) => o.id === id);
  const scaleNow = () => (host.clientWidth / SLIDE_W) || 1;

  function initMoveable() {
    moveable = new Moveable(container, {
      target: null, origin: false, draggable: false, resizable: true, rotatable: true,
      throttleResize: 0, throttleRotate: 0, keepRatio: false,
      snappable: true, snapThreshold: 8, isDisplaySnapDigit: true,
      snapDirections: { top: true, left: true, bottom: true, right: true, center: true, middle: true },
      elementSnapDirections: { top: true, left: true, bottom: true, right: true, center: true, middle: true },
      verticalGuidelines: [0, SLIDE_W / 2, SLIDE_W],
      horizontalGuidelines: [0, SLIDE_H / 2, SLIDE_H],
    });
    moveable
      .on('resize', ({ target, width, height, drag: d }) => {
        target.style.width = `${Math.max(20, width)}px`;
        target.style.height = `${Math.max(20, height)}px`;
        target.style.transform = d.transform;
      })
      .on('resizeEnd', ({ target, lastEvent }) => { if (lastEvent) commitFromEl(target); })
      .on('rotate', ({ target, transform }) => { target.style.transform = transform; })
      .on('rotateEnd', ({ target, lastEvent }) => { if (lastEvent) commitFromEl(target); });
  }

  function refreshGuidelines() {
    if (!moveable) return;
    moveable.elementGuidelines = Array.from(stage().querySelectorAll('.slide-obj')).filter((e) => e.dataset.id !== selectedId);
  }

  function commitFromEl(target) {
    const m = modelOf(target.dataset.id); if (!m) return;
    const tr = parseTransform(target.style.transform);
    m.x = Math.round(tr.x); m.y = Math.round(tr.y); m.rotation = Math.round(tr.rot);
    m.w = Math.round(target.offsetWidth); m.h = Math.round(target.offsetHeight);
    if (moveable) moveable.updateRect();
    onSelect && onSelect(m);
    commit();
  }

  function setSelection(id) {
    if (editingId) return;
    selectedId = id || null;
    if (!moveable) initMoveable();
    stage()?.querySelectorAll('.slide-obj.is-selected').forEach((n) => n.classList.remove('is-selected'));
    const el = selectedId ? elOf(selectedId) : null;
    if (el) el.classList.add('is-selected');
    refreshGuidelines();
    moveable.target = el || null;
    if (el) moveable.updateRect();
    onSelect && onSelect(selectedId ? modelOf(selectedId) : null);
  }

  // snapping pozycji obiektu (x,y) do osi/krawędzi slajdu i innych obiektów
  function snapXY(id, x, y, w, h) {
    const vLines = [0, SLIDE_W / 2, SLIDE_W];
    const hLines = [0, SLIDE_H / 2, SLIDE_H];
    (getSlide().content.objects || []).forEach((o) => {
      if (o.id === id) return;
      vLines.push(o.x, o.x + o.w / 2, o.x + o.w);
      hLines.push(o.y, o.y + o.h / 2, o.y + o.h);
    });
    let bV = null;
    [x, x + w / 2, x + w].forEach((val) => vLines.forEach((L) => { const d = Math.abs(val - L); if (d <= SNAP && (!bV || d < bV.d)) bV = { d, shift: L - val }; }));
    let bH = null;
    [y, y + h / 2, y + h].forEach((val) => hLines.forEach((L) => { const d = Math.abs(val - L); if (d <= SNAP && (!bH || d < bH.d)) bH = { d, shift: L - val }; }));
    return { x: Math.round(bV ? x + bV.shift : x), y: Math.round(bH ? y + bH.shift : y) };
  }

  // własny drag ciała obiektu (pointer)
  function onPointerDown(e) {
    if (editingId) return;
    if (e.target.closest('.moveable-control, .moveable-line, .moveable-rotation, .moveable-control-box')) return; // uchwyt → Moveable
    const objEl = e.target.closest('.slide-obj');
    if (!objEl) { setSelection(null); return; }
    if (objEl.dataset.id !== selectedId) setSelection(objEl.dataset.id);
    const m = modelOf(objEl.dataset.id); if (!m || m.locked) return;
    drag = { id: m.id, el: objEl, sx: e.clientX, sy: e.clientY, ox: m.x, oy: m.y, scale: scaleNow(), rot: m.rotation || 0, nx: m.x, ny: m.y, moved: false };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }
  function onPointerMove(e) {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / drag.scale;
    const dy = (e.clientY - drag.sy) / drag.scale;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    const snapped = snapXY(drag.id, drag.ox + dx, drag.oy + dy, drag.el.offsetWidth, drag.el.offsetHeight);
    drag.nx = snapped.x; drag.ny = snapped.y;
    drag.el.style.transform = `translate(${drag.nx}px,${drag.ny}px) rotate(${drag.rot}deg)`;
    if (moveable && moveable.target) moveable.updateRect();
  }
  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (drag && drag.moved) {
      const m = modelOf(drag.id);
      if (m) { m.x = drag.nx; m.y = drag.ny; if (moveable) moveable.updateRect(); commit(); }
    }
    drag = null;
  }

  function enterTextEdit(id) {
    const el = elOf(id); const txt = el?.querySelector('.slide-obj__text');
    if (!txt) return;
    editingId = id;
    if (moveable) moveable.target = null;
    stage()?.querySelectorAll('.slide-obj.is-selected').forEach((n) => n.classList.remove('is-selected'));
    el.classList.add('is-editing');
    txt.setAttribute('contenteditable', 'true');
    txt.focus();
    try { const r = document.createRange(); r.selectNodeContents(txt); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (_) {}
    const finish = () => {
      txt.removeEventListener('blur', finish);
      txt.removeAttribute('contenteditable');
      el.classList.remove('is-editing');
      editingId = null;
      const m = modelOf(id);
      const html = textToHtml(txt.innerText);
      if (m && (m.richText || '') !== html) { m.richText = html; commit(); }
      setSelection(id);
    };
    txt.addEventListener('blur', finish);
  }

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('dblclick', (e) => {
    const objEl = e.target.closest('.slide-obj--text');
    if (objEl) enterTextEdit(objEl.dataset.id);
  });

  return {
    select(id) { setSelection(id); },
    clear() { setSelection(null); },
    selected: () => selectedId,
    isEditing: () => !!editingId,
    enterTextEdit,
    updateRect() { if (moveable && moveable.target) moveable.updateRect(); },
    destroy() { window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); if (moveable) { moveable.destroy(); moveable = null; } selectedId = null; editingId = null; drag = null; },
  };
}
