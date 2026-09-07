import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/lib/rezyserka-model.js';

// Testujemy prawdziwy kod promptera i osi czasu; DOM oraz transport zastępuje mały adapter.
const source = readFileSync(new URL('../src/lib/strefa-prompter.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function setup() {
  let document;
  class Element {
    constructor() {
      this.hidden = false; this.textContent = ''; this.style = {}; this.scrollTop = 0;
      this.nodes = new Map(); this.listeners = {}; this.htmlWrites = 0;
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    set innerHTML(value) { this.html = value; this.htmlWrites++; }
    get innerHTML() { return this.html; }
    querySelector(selector) {
      if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
      return this.nodes.get(selector);
    }
    querySelectorAll(selector) {
      return selector === '[data-tp="toggle"]' ? [this.querySelector('.tp-start'), get('#tp-toggle')] : [];
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    focus() { document.activeElement = this; }
    contains(el) { return el === this || [...this.nodes.values()].includes(el); }
  }
  const elements = new Map();
  const get = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  get('#pr-teleprompter').hidden = true;
  document = { hidden: false, body: new Element(), activeElement: null, addEventListener() {} };
  const requests = [], timers = new Set();
  const pending = () => new Promise(resolve => requests.push(resolve));
  const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: pending, single: pending }) }) }) };
  const context = vm.createContext({ ...model, document, window: { addEventListener() {} },
    location: { hash: '#/film/f1/long' }, $: get, getClient: () => sb, getTeamUser: async () => null,
    startRealtime: async () => {}, esc: String, toast() {},
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
  });
  vm.runInContext(source, context);
  return { get, requests, timers,
    run: code => vm.runInContext(code, context),
    apply(row) { context.row = structuredClone(row); vm.runInContext('aktualizujFilm(row)', context); },
  };
}
const scene = (id, texts) => ({ id, tytul: id, rodzaj: 'demo', dur: 10,
  bity: texts.map(([id, tekst]) => ({ id, tekst, dur: 5, reczny: true })), obraz: [], nakladki: [] });
const row = () => ({ id: 'f1', title: 'Film', data: { status: 'rozpisany',
  long: { wpm: 145, sceny: [scene('s1', [['a', 'Pierwszy tekst'], ['b', 'Drugi tekst']]), scene('s2', [['c', 'Koniec']])] },
  short: { wpm: 150, sceny: [scene('short', [['d', 'Short']])] },
} });
function playing() {
  const h = setup(); h.apply(row());
  h.run('startPrompter(); tpAction("toggle"); countdown=0; tick();');
  return h;
}

test('live text updates preserve playback, scroll, countdown and stable touch controls', () => {
  const h = playing(), tp = h.get('#pr-teleprompter');
  h.run('elapsedBit=2'); tp.querySelector('.tp-main').scrollTop = 70;
  const writes = tp.htmlWrites, timer = h.run('timer');
  const next = row(); next.data.long.sceny[0].bity[0].tekst = 'Poprawiony tekst';
  next.data.long.sceny[0].bity[1].tekst = 'Nowy kolejny fragment';
  h.apply(next);
  assert.equal(tp.querySelector('.tp-tekst').textContent, 'Poprawiony tekst');
  assert.match(tp.querySelector('.tp-nast').textContent, /Nowy kolejny fragment/);
  assert.equal(h.run('elapsedBit'), 2); assert.equal(h.run('timer'), timer);
  assert.equal(h.run('running'), true); assert.equal(tp.hidden, false);
  assert.equal(tp.querySelector('.tp-main').scrollTop, 70); assert.equal(tp.htmlWrites, writes);
  h.run('tpAction("toggle"); tpAction("toggle"); tick()');
  const countdown = h.run('countdown'); next.title = 'Nowy tytuł'; h.apply(next);
  assert.equal(h.run('countdown'), countdown);
  assert.match(h.get('#pr-scenariusz').innerHTML, /Nowy tytuł/);
});

test('inserting and moving fragments keeps the currently read bit by ID', () => {
  const h = playing(); h.run('tpAction("next"); elapsedBit=2');
  const next = row(); next.data.long.sceny.unshift(scene('new', [['new-bit', 'Nowy początek']]));
  h.apply(next); assert.equal(h.run('bity[idx].id'), 'b'); assert.equal(h.run('idx'), 2);
  next.data.long.sceny[1].bity.reverse(); h.apply(next);
  assert.equal(h.run('bity[idx].id'), 'b'); assert.equal(h.run('idx'), 1);
  assert.equal(h.run('elapsedBit'), 2); assert.equal(h.run('running'), true);
});

test('deleting current bit pauses at next surviving fragment; empty variant exits safely', () => {
  const h = playing(); h.run('tpAction("next")');
  const next = row(); next.data.long.sceny[0].bity.pop(); h.apply(next);
  assert.equal(h.run('bity[idx].id'), 'c'); assert.equal(h.run('running'), false);
  assert.equal(h.run('elapsedBit'), 0); assert.equal(h.timers.size, 0);
  next.data.long.sceny = []; h.apply(next);
  assert.equal(h.get('#pr-teleprompter').hidden, true);
});

test('duration changes refresh clocks without restarting a paused or finished take', () => {
  const h = playing(); h.run('elapsedBit=4; tpAction("toggle")');
  const next = row(); next.data.long.sceny[0].bity[0].dur = 2; next.data.long.sceny[0].dur = 7;
  h.apply(next); assert.equal(h.run('elapsedBit'), 2); assert.equal(h.run('running'), false);
  assert.equal(h.get('#tp-total').textContent, '/ 0:17');
  h.run('idx=bity.length-1; elapsedBit=bity[idx].dur; renderTp()');
  next.data.long.sceny[1].dur = 15; h.apply(next);
  assert.equal(h.run('skonczone()'), true); assert.equal(h.run('running'), false);
});

test('updates to another variant leave current text and state intact; identical reads do not render', () => {
  const h = playing(); h.run('elapsedBit=2'); const next = row();
  const writes = h.get('#pr-scenariusz').htmlWrites; h.apply(next);
  assert.equal(h.get('#pr-scenariusz').htmlWrites, writes);
  next.data.short.sceny[0].bity[0].tekst = 'Inny short'; h.apply(next);
  assert.equal(h.get('#pr-teleprompter').querySelector('.tp-tekst').textContent, 'Pierwszy tekst');
  assert.equal(h.run('elapsedBit'), 2); assert.equal(h.run('running'), true);
});

test('late fetches cannot overwrite a newer response or a different route', async () => {
  const h = playing(); const a = h.run('refreshFilm()'), b = h.run('refreshFilm()');
  const newer = row(); newer.data.long.sceny[0].bity[0].tekst = 'Najnowszy';
  h.requests[1]({ data: newer }); await b;
  h.requests[0]({ data: row() }); await a;
  assert.equal(h.get('#pr-teleprompter').querySelector('.tp-tekst').textContent, 'Najnowszy');
  const old = h.run('refreshFilm()'); h.run('routeVersion++; ktory="short"');
  const other = row(); other.id = 'f2'; h.apply(other);
  h.requests[2]({ data: row() }); await old; assert.equal(h.run('film.id'), 'f2');
});

test('network errors retain the last script and a later refresh catches up', async () => {
  const h = playing(); const request = h.run('refreshFilm()');
  h.requests[0]({ error: new Error('offline') }); await request;
  assert.equal(h.run('running'), true); assert.equal(h.run('film.id'), 'f1');
  const retry = h.run('refreshFilm()'); const changed = row(); changed.title = 'Po odzyskaniu sieci';
  h.requests[1]({ data: changed }); await retry;
  assert.equal(h.run('film.tytul'), changed.title);
});

test('save arriving during initial route load is fetched again after loading', async () => {
  const h = setup(); const loading = h.run('route()'); await h.run('refreshFilm()');
  h.requests[0]({ data: row() }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 2);
  const changed = row(); changed.title = 'Zapis podczas otwierania';
  h.requests[1]({ data: changed }); await loading;
  assert.equal(h.run('film.tytul'), changed.title);
});


test('fullscreen text selection and context menus are cancelled without blocking control clicks', () => {
  const h = playing(), tp = h.get('#pr-teleprompter');
  for (const event of ['selectstart', 'contextmenu']) {
    let cancelled = false;
    tp.listeners[event]({ preventDefault() { cancelled = true; } });
    assert.equal(cancelled, true);
  }
  tp.listeners.click({ target: { closest: selector => selector === '[data-tp]' ? { dataset: { tp: 'toggle' } } : null } });
  assert.equal(h.run('running'), false);
});
