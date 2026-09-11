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
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name), toggle(name, value) { if (value) classes.add(name); else classes.delete(name); } };
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
  const sent = [], handlers = {};
  const channel = {
    on(type, opts, fn) { handlers[`${type}:${opts.event}`] = fn; return channel; },
    subscribe(cb) { channel.status = cb; return channel; },
    send(msg) { sent.push(msg); return Promise.resolve('ok'); },
    track: async () => {}, untrack() {}, presenceState: () => ({ a: [], b: [] }),
    emit: (event, payload) => handlers[`broadcast:${event}`]?.({ payload }),
  };
  const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: pending, single: pending }) }) }),
    channel: (name) => { channel.name = name; return channel; }, removeChannel() {} };
  const context = vm.createContext({ ...model, document, window: { addEventListener() {} },
    location: { hash: '#/film/f1/long' }, $: get, getClient: () => sb, getTeamUser: async () => null,
    startRealtime: async () => {}, esc: String, toast() {},
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
    setTimeout: fn => fn(), Date, Math,
  });
  vm.runInContext(source, context);
  return { get, requests, timers, sent, channel,
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


test('reading controls disappear when idle, return on interaction and stay visible on pause', () => {
  const h = playing(), tp = h.get('#pr-teleprompter');
  h.run('for (let i = 0; i < 26; i++) tick()');
  assert.equal(tp.classList.contains('tp-reading'), true);
  tp.listeners.pointermove();
  assert.equal(tp.classList.contains('tp-reading'), false);
  h.run('for (let i = 0; i < 26; i++) tick()');
  assert.equal(tp.classList.contains('tp-reading'), true);
  tp.listeners.pointerdown();
  assert.equal(tp.classList.contains('tp-reading'), false);
  h.run('tpAction("toggle")');
  assert.equal(tp.querySelector('.tp-stan').hidden, true);
  assert.equal(tp.querySelector('.tp-main').classList.contains('tp-main--dim'), false);
  assert.equal(tp.querySelector('.tp-status').textContent, 'Pauza');
});

test('only the countdown covers the script; playback restores readable text', () => {
  const h = setup(); h.apply(row()); h.run('startPrompter()');
  const tp = h.get('#pr-teleprompter');
  assert.equal(tp.querySelector('.tp-stan').hidden, true);
  h.run('tpAction("toggle")');
  assert.equal(tp.querySelector('.tp-stan').hidden, false);
  assert.equal(tp.querySelector('.tp-state-title').textContent, '3');
  h.run('for (let i = 0; i < 31; i++) tick()');
  assert.equal(tp.querySelector('.tp-stan').hidden, true);
  assert.equal(tp.querySelector('.tp-main').classList.contains('tp-main--dim'), false);
});

test('manual actions broadcast state; auto-advance and exit stay local', () => {
  const h = playing();
  assert.equal(h.channel.name, 'prompter-f1-long');
  const states = () => h.sent.filter(m => m.event === 'state');
  const n = states().length;
  h.run('elapsedBit = 4.95; tick()'); // automatyczne przejście do drugiego fragmentu
  assert.equal(h.run('idx'), 1); assert.equal(states().length, n);
  h.run('tpAction("next")');
  const last = states().at(-1).payload;
  assert.equal(states().length, n + 1);
  assert.deepEqual([last.bitId, last.scenaId, last.idx, last.running], ['c', 's2', 2, true]);
  h.run('tpAction("exit")');
  assert.equal(states().length, n + 1);
  assert.equal(h.run('syncCh'), null);
});

test('incoming state is adopted by fragment ID, own echoes and identical states are ignored', () => {
  const h = playing(), tp = h.get('#pr-teleprompter');
  const own = h.run('peerId');
  h.channel.emit('state', { peer: own, bitId: 'c', scenaId: 's2', idx: 2, elapsedBit: 0, running: false, countdown: 0 });
  assert.equal(h.run('idx'), 0);
  h.channel.emit('state', { peer: 'zz', bitId: 'c', scenaId: 's2', idx: 0, elapsedBit: 1.2, running: false, countdown: 0 });
  assert.equal(h.run('idx'), 2); assert.equal(h.run('running'), false); assert.equal(h.run('timer'), null);
  assert.equal(tp.querySelector('.tp-tekst').textContent, 'Koniec');
  assert.equal(tp.querySelector('.tp-status').textContent, 'Pauza');
  h.channel.emit('state', { peer: 'zz', bitId: 'a', scenaId: 's1', idx: 0, elapsedBit: 0, running: true, countdown: 3 });
  assert.equal(h.run('idx'), 0); assert.equal(h.run('countdown'), 3); assert.notEqual(h.run('timer'), null);
  h.run('countdown = 0; tick(); elapsedBit = 2');
  const timer = h.run('timer');
  h.channel.emit('state', { peer: 'zz', bitId: 'a', scenaId: 's1', idx: 0, elapsedBit: 2.2, running: true, countdown: 0 });
  assert.equal(h.run('elapsedBit'), 2); assert.equal(h.run('timer'), timer);
});

test('newcomer says hello and running devices reply with their state; peers count shows in header', () => {
  const h = playing(), tp = h.get('#pr-teleprompter');
  h.channel.status('SUBSCRIBED');
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    assert.equal(h.sent.some(m => m.event === 'hello'), true);
    const before = h.sent.filter(m => m.event === 'state').length;
    h.channel.emit('hello', { peer: 'zz' });
    assert.equal(h.sent.filter(m => m.event === 'state').length, before + 1);
    h.run('peers = 2; renderTp()');
    assert.equal(tp.querySelector('.tp-peers').textContent, '● 2 urządzenia');
  });
});

test('progress bar and remaining seconds of the fragment tick during reading', () => {
  const h = playing(), tp = h.get('#pr-teleprompter');
  h.run('elapsedBit = 2.5; renderTp()');
  assert.equal(tp.querySelector('.tp-pasek i').style.width, '50%');
  assert.equal(tp.querySelector('.tp-bitclock').textContent, '3 s');
  assert.equal(tp.querySelector('.tp-bitclock').classList.contains('tp-bitclock--malo'), true);
});
