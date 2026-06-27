// Kontroler interakcji edytora obiektów.
// Selekcja: pojedyncza, Shift+klik (multi), marquee (gumka na pustym).
// Drag ciała (też grupy) = własny handler pointer (kontrola skali + snapping). Skala/rotacja pojedynczego = Moveable.
// Edycja tekstu: dwuklik.
import Moveable from 'moveable';
import { SLIDE_W, SLIDE_H, sanitizeHtml } from './slide-model.js';

const parseTransform = (t) => {
  const tx = /translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/.exec(t || '');
  const rot = /rotate\(\s*([-\d.]+)deg\s*\)/.exec(t || '');
  return { x: tx ? +tx[1] : 0, y: tx ? +tx[2] : 0, rot: rot ? +rot[1] : 0 };
};
const SNAP = 10;

// opts: { host, getSlide()→{content}, commit(), onSelect(model|{multi,ids}|null), onEmptyDblClick(x,y) }
export function createObjectEditor(opts) {
  const { host, getSlide, commit, onSelect } = opts;
  const container = host.parentElement;
  let moveable = null;
  let selected = [];          // ids zaznaczonych obiektów
  let editingId = null;
  let drag = null;
  let marquee = null;

  const stage = () => host.querySelector('.slide-stage');
  const elOf = (id) => stage()?.querySelector(`.slide-obj[data-id="${id}"]`);
  const modelOf = (id) => (getSlide()?.content.objects || []).find((o) => o.id === id);
  const scaleNow = () => (host.clientWidth / SLIDE_W) || 1;
  const selectedEls = () => selected.map(elOf).filter(Boolean);

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
      .on('resizeStart', ({ inputEvent }) => { moveable.keepRatio = !!(inputEvent && inputEvent.shiftKey); })
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
    moveable.elementGuidelines = Array.from(stage().querySelectorAll('.slide-obj')).filter((e) => !selected.includes(e.dataset.id));
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

  // zastosuj `selected` → klasy, cele Moveable, callback
  function applyTargets() {
    if (editingId) return;
    if (!moveable) initMoveable();
    stage()?.querySelectorAll('.slide-obj.is-selected').forEach((n) => n.classList.remove('is-selected'));
    const els = selectedEls();
    els.forEach((e) => e.classList.add('is-selected'));
    moveable.resizable = selected.length === 1;
    moveable.rotatable = selected.length === 1;
    refreshGuidelines();
    moveable.target = els.length ? (els.length === 1 ? els[0] : els) : null;
    if (els.length) moveable.updateRect();
    onSelect && onSelect(selected.length === 1 ? modelOf(selected[0]) : (selected.length > 1 ? { multi: true, ids: [...selected] } : null));
  }
  function setSingle(id) { selected = id ? [id] : []; applyTargets(); }
  // selekcja świadoma grup: klik w obiekt z grupą zaznacza całą grupę
  function groupIds(id) { const m = modelOf(id); if (m && m.group) return (getSlide().content.objects || []).filter((o) => o.group === m.group).map((o) => o.id); return [id]; }
  function selectGroup(id) { selected = groupIds(id); applyTargets(); }
  function toggleGroup(id) { const g = groupIds(id); const allIn = g.every((i) => selected.includes(i)); if (allIn) selected = selected.filter((i) => !g.includes(i)); else g.forEach((i) => { if (!selected.includes(i)) selected.push(i); }); applyTargets(); }

  function snapXY(ids, x, y, w, h) {
    const vLines = [0, SLIDE_W / 2, SLIDE_W];
    const hLines = [0, SLIDE_H / 2, SLIDE_H];
    (getSlide().content.objects || []).forEach((o) => {
      if (ids.includes(o.id)) return;
      vLines.push(o.x, o.x + o.w / 2, o.x + o.w);
      hLines.push(o.y, o.y + o.h / 2, o.y + o.h);
    });
    let bV = null;
    [x, x + w / 2, x + w].forEach((val) => vLines.forEach((L) => { const d = Math.abs(val - L); if (d <= SNAP && (!bV || d < bV.d)) bV = { d, shift: L - val }; }));
    let bH = null;
    [y, y + h / 2, y + h].forEach((val) => hLines.forEach((L) => { const d = Math.abs(val - L); if (d <= SNAP && (!bH || d < bH.d)) bH = { d, shift: L - val }; }));
    return { dx: bV ? bV.shift : 0, dy: bH ? bH.shift : 0 };
  }

  function stagePoint(e) {
    const st = stage(); const r = st.getBoundingClientRect(); const sc = scaleNow();
    return { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc };
  }

  function onPointerDown(e) {
    if (editingId) return;
    if (e.target.closest('.moveable-control, .moveable-line, .moveable-rotation, .moveable-control-box')) return;
    const objEl = e.target.closest('.slide-obj');
    if (!objEl) {                                    // pusty → marquee
      if (!e.shiftKey) setSingle(null);
      const p = stagePoint(e);
      marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey, base: [...selected] };
      ensureMarqueeEl();
      window.addEventListener('pointermove', onMarqueeMove);
      window.addEventListener('pointerup', onMarqueeUp);
      return;
    }
    const id = objEl.dataset.id;
    if (e.shiftKey) { toggleGroup(id); return; }
    if (!selected.includes(id)) selectGroup(id);
    // drag (grupa, jeśli >1 zaznaczone)
    const m = modelOf(id); if (!m || m.locked) return;
    const items = selected.map((sid) => { const mm = modelOf(sid); return mm ? { id: sid, el: elOf(sid), ox: mm.x, oy: mm.y, rot: mm.rotation || 0, w: mm.w, h: mm.h } : null; }).filter(Boolean);
    drag = { items, primary: id, sx: e.clientX, sy: e.clientY, scale: scaleNow(), moved: false };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }
  function onPointerMove(e) {
    if (!drag) return;
    let dx = (e.clientX - drag.sx) / drag.scale;
    let dy = (e.clientY - drag.sy) / drag.scale;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    const prim = drag.items.find((it) => it.id === drag.primary);
    const snap = snapXY(selected, prim.ox + dx, prim.oy + dy, prim.w, prim.h);
    dx += snap.dx; dy += snap.dy;
    drag.items.forEach((it) => {
      it.nx = Math.round(it.ox + dx); it.ny = Math.round(it.oy + dy);
      if (it.el) it.el.style.transform = `translate(${it.nx}px,${it.ny}px) rotate(${it.rot}deg)`;
    });
    if (moveable && moveable.target) moveable.updateRect();
  }
  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (drag && drag.moved) {
      drag.items.forEach((it) => { const m = modelOf(it.id); if (m && it.nx != null) { m.x = it.nx; m.y = it.ny; } });
      if (moveable) moveable.updateRect();
      commit();
    }
    drag = null;
  }

  // marquee (gumka)
  let marqueeEl = null;
  function ensureMarqueeEl() { if (!marqueeEl) { marqueeEl = document.createElement('div'); marqueeEl.className = 'slide-marquee'; } stage().appendChild(marqueeEl); }
  function onMarqueeMove(e) {
    if (!marquee) return;
    const p = stagePoint(e); marquee.x1 = p.x; marquee.y1 = p.y;
    const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
    const w = Math.abs(marquee.x1 - marquee.x0), h = Math.abs(marquee.y1 - marquee.y0);
    if (marqueeEl) { marqueeEl.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`; }
    const hit = (getSlide().content.objects || []).filter((o) => o.x < x + w && o.x + o.w > x && o.y < y + h && o.y + o.h > y).map((o) => o.id);
    selected = marquee.add ? Array.from(new Set([...marquee.base, ...hit])) : hit;
    stage()?.querySelectorAll('.slide-obj.is-selected').forEach((n) => n.classList.remove('is-selected'));
    selectedEls().forEach((el) => el.classList.add('is-selected'));
  }
  function onMarqueeUp() {
    window.removeEventListener('pointermove', onMarqueeMove);
    window.removeEventListener('pointerup', onMarqueeUp);
    if (marqueeEl) { marqueeEl.remove(); }
    marquee = null;
    applyTargets();
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
    opts.onEditStart && opts.onEditStart(id);
    const finish = () => {
      txt.removeEventListener('blur', finish);
      txt.removeAttribute('contenteditable');
      el.classList.remove('is-editing');
      editingId = null;
      opts.onEditEnd && opts.onEditEnd(id);
      const m = modelOf(id);
      const html = sanitizeHtml(txt.innerHTML);
      if (m && (m.richText || '') !== html) { m.richText = html; commit(); }
      setSingle(id);
    };
    txt.addEventListener('blur', finish);
  }

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('dblclick', (e) => {
    const txtEl = e.target.closest('.slide-obj--text');
    if (txtEl) { enterTextEdit(txtEl.dataset.id); return; }
    if (e.target.closest('.slide-obj')) return;
    if (opts.onEmptyDblClick) { const p = stagePoint(e); opts.onEmptyDblClick(Math.round(p.x), Math.round(p.y)); }
  });

  return {
    select(id) { setSingle(id); },
    selectMany(ids) { selected = [...ids]; applyTargets(); },
    clear() { setSingle(null); },
    selected: () => (selected.length === 1 ? selected[0] : null),
    selectedIds: () => [...selected],
    isEditing: () => !!editingId,
    enterTextEdit,
    updateRect() { if (moveable && moveable.target) moveable.updateRect(); },
    destroy() {
      window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onMarqueeMove); window.removeEventListener('pointerup', onMarqueeUp);
      if (marqueeEl) marqueeEl.remove();
      if (moveable) { moveable.destroy(); moveable = null; }
      selected = []; editingId = null; drag = null; marquee = null;
    },
  };
}
