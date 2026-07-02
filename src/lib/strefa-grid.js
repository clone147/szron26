// Wspólny silnik nawigacji klawiaturowej po siatce (Szkolenia / Programiści):
// aktywna komórka, edycja inline z zapisem do DB, ruch strzałkami/Tab/Enter.
// Stan (activeTd/editing) żyje w instancji — strażniki pollingu czytają getter `editing`,
// renderAll woła `reset()` po przebudowie DOM siatki.
export function createGridNav({ getRecord, dbUpdate, cellInner, maxCol }) {
  let activeTd = null;
  let editing = false;

  function setActive(td) {
    if (activeTd) activeTd.classList.remove('is-active');
    activeTd = td;
    if (td) {
      td.classList.add('is-active');
      td.closest('.dgrid-wrap')?.focus({ preventScroll: true });
      td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  const cellAt = (grid, r, c) => grid.querySelector(`td[data-r="${r}"][data-c="${c}"]`);

  // Indeks znaku pod kursorem myszy — by postawić karetkę dokładnie tam, gdzie user kliknął.
  function caretIndexFromPoint(td, x, y) {
    try {
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r && td.contains(r.startContainer)) return r.startOffset;
      } else if (document.caretPositionFromPoint) {
        const pp = document.caretPositionFromPoint(x, y);
        if (pp && td.contains(pp.offsetNode)) return pp.offset;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function beginEdit(td, opts = {}) {
    if (editing) return;
    const col = td.dataset.col; if (!col) return;
    const { caret = null, appendChar = null } = opts;
    const { id, rec } = getRecord(td.closest('tr'));
    const orig = rec[col] ?? '';
    editing = true;
    if (activeTd && activeTd !== td) activeTd.classList.remove('is-active');
    activeTd = td;
    td.classList.add('is-editing');
    // type="text" celowo dla wszystkich kolumn — email/tel nie wspierają setSelectionRange (rzucają wyjątek)
    td.innerHTML = `<input class="dgrid-edit" type="text">`;
    const inp = td.querySelector('input');
    inp.value = appendChar != null ? orig + appendChar : orig;
    inp.focus();
    // Karetka: dopisany znak → koniec; klik → w miejscu kliknięcia; F2/Enter → koniec.
    try {
      const pos = (appendChar == null && caret != null) ? Math.min(caret, inp.value.length) : inp.value.length;
      inp.setSelectionRange(pos, pos);
    } catch (e) { /* ignore */ }
    let done = false;
    const finish = async (dir) => {
      if (done) return; done = true;
      const val = inp.value.trim();
      editing = false;
      td.classList.remove('is-editing');
      td.innerHTML = cellInner(rec, col);
      setActive(td);
      if (val !== (orig ?? '')) {
        rec[col] = val;
        td.innerHTML = cellInner(rec, col);
        if (!(await dbUpdate(id, { [col]: val || null }))) { rec[col] = orig; td.innerHTML = cellInner(rec, col); }
      }
      if (dir) moveActive(td.closest('.dgrid'), td, dir);
    };
    const cancel = () => {
      if (done) return; done = true;
      editing = false; td.classList.remove('is-editing'); td.innerHTML = cellInner(rec, col); setActive(td);
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); finish('down'); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(e.shiftKey ? 'prev' : 'next'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); finish('down'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); finish('up'); }
    });
    inp.addEventListener('blur', () => finish(null));
  }

  function moveActive(grid, td, dir) {
    let r = +td.dataset.r, c = +td.dataset.c;
    if (dir === 'down') r++;
    else if (dir === 'up') r = Math.max(0, r - 1);
    else if (dir === 'next') { c++; if (c > maxCol) { c = 0; r++; } }
    else if (dir === 'prev') { c--; if (c < 0) { c = maxCol; r = Math.max(0, r - 1); } }
    const nt = cellAt(grid, r, c);
    if (nt) setActive(nt);
  }

  // Wspólny rdzeń klawiatury: strzałki, Tab, Enter/F2 → edycja, znak drukowalny → edycja z dopiskiem.
  // Specyfikę strony (filtr pól, toggle obecności) rejestruje się WŁASNYM handlerem PRZED tym
  // (ze stopImmediatePropagation dla przechwyconych klawiszy).
  function bindKeydown(wrap, grid) {
    wrap.addEventListener('keydown', (e) => {
      if (editing) return;
      if (!activeTd || !grid.contains(activeTd)) return;
      const td = activeTd;
      let r = +td.dataset.r, c = +td.dataset.c; let handled = true;
      switch (e.key) {
        case 'ArrowRight': c = Math.min(maxCol, c + 1); break;
        case 'ArrowLeft': c = Math.max(0, c - 1); break;
        case 'ArrowDown': r++; break;
        case 'ArrowUp': r = Math.max(0, r - 1); break;
        case 'Tab': e.preventDefault(); moveActive(grid, td, e.shiftKey ? 'prev' : 'next'); return;
        case 'Enter': case 'F2': e.preventDefault(); beginEdit(td); return;
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); beginEdit(td, { appendChar: e.key }); }
          handled = false;
      }
      if (handled) { const nt = cellAt(grid, r, c); if (nt) { e.preventDefault(); setActive(nt); } }
    });
  }

  return {
    get editing() { return editing; },
    get active() { return activeTd; },
    setActive, cellAt, caretIndexFromPoint, beginEdit, moveActive, bindKeydown,
    reset() { activeTd = null; }, // wołane w renderAll — DOM siatki właśnie się przebudował
  };
}
