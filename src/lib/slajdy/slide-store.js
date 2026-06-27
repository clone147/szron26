// Historia undo/redo na snapshotach `content` — per slajd.
// past[ostatni] = stan bieżący. push = nowa transakcja. undo/redo zwracają snapshot do zastosowania.
export function createHistory(limit = 80) {
  const stacks = new Map(); // slideId -> { past:[snapshot...], future:[snapshot...] }
  const get = (id) => { if (!stacks.has(id)) stacks.set(id, { past: [], future: [] }); return stacks.get(id); };
  return {
    // ustaw punkt startowy slajdu (przy wczytaniu / utworzeniu)
    reset(id, snapshot) { stacks.set(id, { past: [snapshot], future: [] }); },
    // zapisz nową transakcję (po geście). Pomija jeśli identyczny ze szczytem.
    push(id, snapshot) {
      const h = get(id);
      const top = h.past[h.past.length - 1];
      if (top && JSON.stringify(top) === JSON.stringify(snapshot)) return;
      h.past.push(snapshot);
      if (h.past.length > limit) h.past.shift();
      h.future.length = 0;
    },
    canUndo(id) { return get(id).past.length > 1; },
    canRedo(id) { return get(id).future.length > 0; },
    undo(id) {
      const h = get(id);
      if (h.past.length < 2) return null;
      h.future.push(h.past.pop());
      return h.past[h.past.length - 1];
    },
    redo(id) {
      const h = get(id);
      if (!h.future.length) return null;
      const snap = h.future.pop();
      h.past.push(snap);
      return snap;
    },
    drop(id) { stacks.delete(id); },
  };
}
