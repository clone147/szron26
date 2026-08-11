// Aplikacja „Sygnały" strefy zamkniętej SZRON — sygnały zakupowe CAIO (oferty pracy + newsy)
// + pipeline kontaktu: statusy firm (caio_companies), log dotyków (caio_touches),
// generator spersonalizowanych sekwencji outbound (szablony z planu CAIO, kopiowanie do schowka).
// Zasada twarda planu: nic nie wysyła się automatycznie — tylko teksty do skopiowania.
import { getClient, getTeamUser } from './supabase.js';
import { $, esc, toast, fmtDate, openModal, closeModal } from './strefa-ui.js';

const sb = getClient();

let signals = [];
const companies = new Map(); // firma -> {status, notatka, tier, chemia, dossier, dossier_at}
const touches = new Map();   // firma -> [touch, ...] (najnowszy pierwszy)
const contacts = new Map();  // firma -> [contact, ...]
let query = '';
let fTyp = '';           // '' | 'praca' | 'news'
let fStatus = 'aktywne'; // 'aktywne' (nowy+przeczytany) | 'nowy' | 'odrzucony' | ''
const openFirms = new Set();

const WAGA_LABEL = { 3: 'Gorący', 2: 'Ciepły', 1: 'Info' };
const PIPE = [
  ['nowy', 'Nowy'], ['dotkniety', 'Dotknięty'], ['rozmowa', 'Rozmowa'],
  ['propozycja', 'Propozycja'], ['klient', 'Klient'], ['odpadl', 'Odpadł'],
];
const TOUCH_LABEL = { zaproszenie: 'Zaproszenie LI', wiadomosc: 'Wiadomość LI', email: 'E-mail', call: 'Call' };
// Sekwencja z planu: zaproszenie (d0) → follow-up (d3–4) → e-mail (d7) → break-up (d21).
// next: [kolejny krok, dni od poprzedniego dotyku]
const NEXT_STEP = {
  null: ['zaproszenie', 0, 'Nota zaproszenia LI'],
  zaproszenie: ['wiadomosc', 3, 'Follow-up po akceptacji'],
  wiadomosc: ['email', 3, 'E-mail do CTO/VP Eng'],
  email: ['wiadomosc', 14, 'Break-up'],
};

const ICO = {
  chev: '<svg class="strefa-tr__chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  job: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V6"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  send: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
};

/* ── dane ── */
async function load() {
  const [sig, comp, tch, cnt] = await Promise.all([
    sb.from('caio_signals').select('*').order('created_at', { ascending: false }),
    sb.from('caio_companies').select('*'),
    sb.from('caio_touches').select('*').order('created_at', { ascending: false }),
    sb.from('caio_contacts').select('*').order('created_at'),
  ]);
  const err = sig.error || comp.error || tch.error || cnt.error;
  if (err) { toast('Błąd wczytywania', err.message, 'err'); return; }
  signals = sig.data ?? [];
  companies.clear();
  for (const c of comp.data ?? []) companies.set(c.firma, c);
  touches.clear();
  for (const t of tch.data ?? []) {
    if (!touches.has(t.firma)) touches.set(t.firma, []);
    touches.get(t.firma).push(t);
  }
  contacts.clear();
  for (const c of cnt.data ?? []) {
    if (!contacts.has(c.firma)) contacts.set(c.firma, []);
    contacts.get(c.firma).push(c);
  }
  render();
}

function companyOf(firma) {
  return companies.get(firma) ?? { firma, status: 'nowy', notatka: null };
}
async function saveCompany(firma, patch) {
  const cur = companyOf(firma);
  const row = {
    firma, tier: signals.find((s) => s.firma === firma && s.tier)?.tier ?? cur.tier ?? null,
    status: cur.status, notatka: cur.notatka ?? null, chemia: cur.chemia ?? false,
    dossier: cur.dossier ?? null, dossier_at: cur.dossier_at ?? null,
    ...patch, updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('caio_companies').upsert(row, { onConflict: 'firma' });
  if (error) { toast('Błąd zapisu', error.message, 'err'); return false; }
  companies.set(firma, row);
  return true;
}
async function addTouch(firma, typ, wynik, tresc = null) {
  const { data, error } = await sb.from('caio_touches').insert({ firma, typ, wynik: wynik || null, tresc }).select().single();
  if (error) { toast('Błąd zapisu dotyku', error.message, 'err'); return false; }
  if (!touches.has(firma)) touches.set(firma, []);
  touches.get(firma).unshift(data);
  if (companyOf(firma).status === 'nowy') await saveCompany(firma, { status: 'dotkniety' });
  return true;
}

/* ── sekwencja / terminy ── */
function nextStepFor(firma) {
  const hist = touches.get(firma) ?? [];
  const st = companyOf(firma).status;
  if (['klient', 'odpadl', 'propozycja', 'rozmowa'].includes(st)) return null; // sekwencja tylko do momentu rozmowy
  const last = hist.find((t) => t.typ !== 'call');
  const key = hist.length >= 4 ? null : (last?.typ ?? null);
  const step = NEXT_STEP[key];
  if (!step) return null;
  const [typ, days, label] = step;
  const due = last ? new Date(new Date(last.created_at).getTime() + days * 864e5) : new Date();
  return { typ, label, due, overdue: due <= new Date() };
}

function bestSignal(firma) {
  const list = signals.filter((s) => s.firma === firma && s.status !== 'odrzucony');
  return list.sort((a, b) => b.waga - a.waga || new Date(b.created_at) - new Date(a.created_at))[0] ?? null;
}
function techOf(firma) {
  const s = signals.find((x) => x.firma === firma && x.typ === 'praca');
  const m = /^Dopasowane:\s*([^·]+)/.exec(s?.opis ?? '');
  return m ? m[1].trim() : 'embedded/C++';
}
function nextRegDate() {
  const today = new Date();
  for (const [d, label] of [['2026-09-11', 'CRA (11.09)'], ['2026-10-03', 'NIS2 (3.10)']]) {
    if (new Date(d) > today) return label;
  }
  return 'najbliższy termin regulacyjny';
}

/* Szablony z planu CAIO (C.7), personalizowane firmą, techem, najgorętszym sygnałem,
   a przy „chemii" dodatkowo imieniem decydenta i hakiem z dossier. */
function sequenceTexts(firma) {
  const tech = techOf(firma);
  const sig = bestSignal(firma);
  const comp = companyOf(firma);
  const kontakt = (contacts.get(firma) ?? [])[0];
  const imie = kontakt?.imie ?? '[Imię]';
  // dossier ma stałą strukturę z planu — linia „Hak: …" nadpisuje hak z sygnału
  const dossierHak = /(?:^|\n)#{0,3}\s*Hak[^:\n]*:\s*(.+)/i.exec(comp.dossier ?? '')?.[1]?.trim();
  const hak = dossierHak ?? (sig ? `${sig.typ === 'praca' ? 'rekrutujecie' : 'głośno o Was'}: ${sig.tytul}` : '');
  return [
    { typ: 'zaproszenie', title: 'Nota zaproszenia LI (≤300 znaków, dzień 0)',
      text: `Dzień dobry, widziałem że ${firma} rekrutuje do zespołu firmware/embedded (${tech}). Pomagam producentom sprzętu wdrażać AI w rozwoju oprogramowania — bez hype'u, z naciskiem na legacy C++ i gotowość na CRA. Chętnie połączę się i podzielę konkretem.` },
    { typ: 'wiadomosc', title: 'Follow-up po akceptacji (dzień 3–4)',
      text: `Dziękuję za przyjęcie zaproszenia. Skoro budujecie własny firmware, może się przydać krótki, darmowy AI-Readiness Assessment dla zespołów embedded — 10 pytań, wynik od ręki: [link]. Jeśli coś w wyniku będzie zaskakujące, chętnie omówię 20 min.` },
    { typ: 'email', title: 'E-mail do CTO/VP Eng (dzień 7)',
      text: `Temat: ${firma} a CRA 11.09 — 24h na zgłoszenie podatności w firmware\n\nDzień dobry ${imie},\n\nod 11 września 2026 CRA nakłada obowiązek zgłaszania aktywnie wykorzystywanych podatności w 24h (kaskada 24/72h/14 dni), także dla produktów już na rynku. Dla zespołów firmware w C++ to głównie kwestia procesu i widoczności kodu.${hak ? `\n\n(Sygnał: ${hak})` : ''}\n\nRobię 1-dniowy warsztat + krótki audyt gotowości łączący to z AI-augmented review. Znajdziemy 20 min w tym tygodniu? Kalendarz: [link].` },
    { typ: 'wiadomosc', title: 'Break-up (dzień 21)',
      text: `Dzień dobry ${imie}, rozumiem że teraz nie priorytet — zamykam wątek z mojej strony. Zostawiam [link do assetu/posta o CRA]; gdyby temat gotowości firmware wrócił przed ${nextRegDate()}, jestem pod ręką. Powodzenia!` },
  ];
}

/* ── widok ── */
function parseOpis(opis) {
  const m = /^Dopasowane:\s*([^·]+?)(?:\s*·\s*(.+))?$/.exec(opis ?? '');
  if (!m) return { kws: [], extra: opis ?? '' };
  return { kws: m[1].split(',').map((s) => s.trim()).filter(Boolean), extra: m[2] ?? '' };
}

function visible() {
  const q = query.toLowerCase();
  return signals.filter((s) => {
    if (fTyp && s.typ !== fTyp) return false;
    if (fStatus === 'aktywne' && s.status === 'odrzucony') return false;
    else if (fStatus && fStatus !== 'aktywne' && s.status !== fStatus) return false;
    if (q && !`${s.firma} ${s.tytul} ${s.opis ?? ''} ${s.zrodlo ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderStats() {
  const nowe = signals.filter((s) => s.status === 'nowy').length;
  const gorace = signals.filter((s) => s.waga === 3 && s.status !== 'odrzucony').length;
  const wToku = [...companies.values()].filter((c) => !['nowy', 'odpadl'].includes(c.status)).length;
  const odkryte = new Set(signals.filter((s) => s.tier === 4 && s.status !== 'odrzucony').map((s) => s.firma)).size;
  const last = signals[0]?.created_at;
  $('#stats').innerHTML = [
    ['Nowe sygnały', nowe], ['Gorące (waga 3)', gorace], ['Odkryte firmy', odkryte], ['Firmy w pipeline', wToku],
    ['Ostatni skan', last ? fmtDate(last) : '—'],
  ].map(([l, n]) => `<div class="strefa-stat"><div class="strefa-stat__num">${n}</div><div class="strefa-stat__lbl">${l}</div></div>`).join('');
}

function renderDue(firms) {
  const due = firms
    .map((f) => ({ firma: f, step: nextStepFor(f) }))
    .filter((d) => d.step && d.step.overdue && (touches.get(d.firma)?.length || companyOf(d.firma).status !== 'nowy' || bestSignal(d.firma)?.waga >= 2));
  $('#due').innerHTML = !due.length ? '' : `<div class="syg-due">
    <span class="syg-due__lbl">${ICO.send} Do dotknięcia dziś:</span>
    ${due.map((d) => `<button class="syg-due__item" data-seq="${esc(d.firma)}">${esc(d.firma)} <em>· ${esc(d.step.label)}</em></button>`).join('')}
  </div>`;
}

function row(s) {
  const { kws, extra } = parseOpis(s.opis);
  return `<div class="syg-row ${s.status === 'odrzucony' ? 'is-dismissed' : ''}" data-id="${s.id}">
    <span class="syg-row__waga syg-row__waga--${s.waga}" title="Waga ${s.waga}: ${WAGA_LABEL[s.waga]}"></span>
    <span class="syg-row__typ" title="${s.typ === 'praca' ? 'Oferta pracy' : 'News'}">${s.typ === 'praca' ? ICO.job : ICO.news}</span>
    <div class="syg-row__main">
      <a class="syg-row__tytul" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.tytul.replace(/\s+—\s+[^—]+$/, ''))} ${ICO.ext}</a>
      <div class="syg-row__meta">
        ${s.status === 'nowy' ? '<span class="strefa-chip strefa-chip--ok">nowy</span>' : ''}
        ${kws.map((k) => `<span class="syg-kw">${esc(k)}</span>`).join('')}
        ${extra ? `<span>${esc(extra)}</span>` : ''}
        ${s.zrodlo ? `<span>${esc(s.zrodlo)}</span>` : ''}
        <span>${fmtDate(s.posted_at || s.created_at)}</span>
      </div>
    </div>
    <div class="syg-row__actions">
      ${s.status === 'nowy' ? `<button class="strefa-iconbtn" data-act="przeczytany" title="Oznacz jako przeczytany">${ICO.check}</button>` : ''}
      ${s.status !== 'odrzucony'
        ? `<button class="strefa-iconbtn" data-act="odrzucony" title="Odrzuć sygnał">${ICO.x}</button>`
        : `<button class="strefa-iconbtn" data-act="nowy" title="Przywróć">${ICO.undo}</button>`}
    </div>
  </div>`;
}

/* minimalny render markdown dossier (nagłówki ##/###, **bold**, listy -) */
function mdLite(md) {
  return esc(md).split('\n').map((l) => {
    if (/^###\s/.test(l)) return `<h5>${l.slice(4)}</h5>`;
    if (/^##\s/.test(l)) return `<h4>${l.slice(3)}</h4>`;
    if (/^#\s/.test(l)) return `<h4>${l.slice(2)}</h4>`;
    if (/^[-*]\s/.test(l)) return `<li>${l.slice(2)}</li>`;
    return l ? `<p>${l}</p>` : '';
  }).join('').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function contactRow(c) {
  return `<div class="syg-contact" data-cid="${c.id}">
    ${ICO.user}
    <strong>${esc(c.imie)}</strong>
    ${c.stanowisko ? `<span>${esc(c.stanowisko)}</span>` : ''}
    ${c.linkedin_url ? `<a href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">LinkedIn ${ICO.ext}</a>` : ''}
    ${c.email ? `<a href="mailto:${esc(c.email)}">${ICO.mail} ${esc(c.email)}</a>` : ''}
    <button class="strefa-iconbtn" data-del-contact title="Usuń kontakt">${ICO.trash}</button>
  </div>`;
}

function touchRow(t) {
  return `<div class="syg-touch">
    <span class="syg-touch__typ">${TOUCH_LABEL[t.typ] ?? t.typ}</span>
    <span class="syg-touch__date">${fmtDate(t.created_at)}</span>
    ${t.wynik ? `<span class="syg-touch__wynik">${esc(t.wynik)}</span>` : ''}
  </div>`;
}

function firmCard(firma, items) {
  const open = openFirms.has(firma);
  const maxWaga = Math.max(...items.map((s) => s.waga));
  const nowe = items.filter((s) => s.status === 'nowy').length;
  const prace = items.filter((s) => s.typ === 'praca').length;
  const newsy = items.length - prace;
  const tier = items.find((s) => s.tier)?.tier;
  const comp = companyOf(firma);
  const hist = touches.get(firma) ?? [];
  const step = nextStepFor(firma);
  const heat = maxWaga === 3 ? '<span class="strefa-chip strefa-chip--error">Gorący</span>'
    : maxWaga === 2 ? '<span class="strefa-chip strefa-chip--pending">Ciepły</span>' : '';
  return `<section class="strefa-tr ${open ? 'is-open' : ''}" data-firma="${esc(firma)}">
    <div class="strefa-tr__head">
      <button type="button" class="syg-toggle" aria-expanded="${open}">
      ${ICO.chev}
      <div class="strefa-tr__grow">
        <div class="strefa-tr__name">${esc(firma)} ${tier === 4 ? '<span class="syg-tier syg-tier--new">odkryta</span>' : tier ? `<span class="syg-tier">Tier ${tier}</span>` : ''}${comp.werdykt ? `<span class="syg-tier syg-w--${comp.werdykt}">${esc(comp.werdykt)}</span>` : ''}</div>
        ${comp.kwalifikacja ? `<div class="strefa-tr__meta syg-kwal">${comp.www ? `<a href="${esc(comp.www)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">www</a> · ` : ''}${esc(comp.kwalifikacja)}</div>` : ''}
        <div class="strefa-tr__meta">
          ${prace ? `<span>${prace} of. pracy</span>` : ''}
          ${newsy ? `<span>${newsy} news.</span>` : ''}
          ${hist.length ? `<span>${hist.length} dot., ost. ${fmtDate(hist[0].created_at)}</span>` : ''}
          ${step ? `<span class="${step.overdue ? 'syg-overdue' : ''}">następny: ${esc(step.label)} ${step.overdue ? '— dziś' : fmtDate(step.due)}</span>` : ''}
        </div>
      </div>
      </button>
      <div class="strefa-tr__counts">
        ${heat}
        ${nowe ? `<span class="strefa-chip strefa-chip--ok">${nowe} nowe</span>` : ''}
        <button type="button" class="strefa-iconbtn syg-star ${comp.chemia ? 'is-on' : ''}" data-chemia title="${comp.chemia ? 'Chemia — tryb pogłębiony (kliknij, by wyłączyć)' : 'Oznacz chemię — tryb pogłębiony'}">${ICO.star}</button>
        <select class="strefa-input syg-status syg-status--${comp.status}" data-status aria-label="Status ${esc(firma)}">
          ${PIPE.map(([v, l]) => `<option value="${v}" ${comp.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="strefa-btn strefa-btn--accent strefa-btn--sm" data-seq="${esc(firma)}">Sekwencja</button>
      </div>
    </div>
    ${open ? `<div class="strefa-tr__body syg-body">
      ${items.map(row).join('')}
      ${comp.chemia || (contacts.get(firma) ?? []).length ? `<div class="syg-touches">
        <div class="syg-touches__lbl">Decydenci <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-add-contact>+ Kontakt</button></div>
        ${(contacts.get(firma) ?? []).map(contactRow).join('') || '<p class="syg-muted">Brak kontaktów — dodaj decydenta z publicznych źródeł.</p>'}
      </div>` : ''}
      ${comp.chemia ? `<div class="syg-touches">
        <div class="syg-touches__lbl">Dossier ${comp.dossier_at ? `<span class="syg-muted">z ${fmtDate(comp.dossier_at)}</span>` : ''}</div>
        ${comp.dossier ? `<div class="syg-dossier">${mdLite(comp.dossier)}</div>`
          : `<p class="syg-muted">Brak dossier. Poproś w sesji Claude Code: „zrób dossier ${esc(firma)}" — research trafi tutaj.</p>`}
      </div>` : ''}
      ${hist.length ? `<div class="syg-touches"><div class="syg-touches__lbl">Dotyki</div>${hist.map(touchRow).join('')}</div>` : ''}
    </div>` : ''}
  </section>`;
}

function render() {
  renderStats();
  const list = visible();
  const byFirma = new Map();
  for (const s of list) {
    if (!byFirma.has(s.firma)) byFirma.set(s.firma, []);
    byFirma.get(s.firma).push(s);
  }
  const firms = [...byFirma.entries()].sort((a, b) => {
    const wa = Math.max(...a[1].map((s) => s.waga)); const wb = Math.max(...b[1].map((s) => s.waga));
    if (wb !== wa) return wb - wa;
    return new Date(b[1][0].created_at) - new Date(a[1][0].created_at);
  });
  renderDue(firms.map(([f]) => f));
  $('#list').innerHTML = firms.map(([f, items]) => firmCard(f, items)).join('');
  $('#empty').hidden = firms.length > 0;
}

/* ── modal sekwencji ── */
function openSequence(firma) {
  const texts = sequenceTexts(firma);
  const step = nextStepFor(firma);
  const box = openModal(`<div class="strefa-modal__body">
    <h2 style="margin:0 0 .2rem">Sekwencja — ${esc(firma)}</h2>
    <p style="margin:0 0 var(--space-md);color:var(--color-text-inv-3);font-size:var(--text-caption)">
      Kopiujesz i wysyłasz ręcznie (LinkedIn/e-mail). „Kopiuj + zaloguj dotyk" od razu dopisuje wpis do historii.
      ${step ? `Następny krok wg sekwencji: <strong>${esc(step.label)}</strong>.` : ''}
    </p>
    ${texts.map((t, i) => `<div class="syg-seq ${step && i === texts.findIndex((x) => x.title.startsWith(step.label)) ? 'is-next' : ''}">
      <div class="syg-seq__head">
        <strong>${esc(t.title)}</strong>
        <span style="flex:1"></span>
        <button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-copy="${i}">${ICO.copy} Kopiuj</button>
        <button class="strefa-btn strefa-btn--accent strefa-btn--sm" data-copylog="${i}">${ICO.copy} Kopiuj + zaloguj dotyk</button>
      </div>
      <textarea class="strefa-input syg-seq__text" data-text="${i}" rows="${Math.min(8, t.text.split('\n').length + 2)}">${esc(t.text)}</textarea>
    </div>`).join('')}
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost" data-close-seq>Zamknij</button></div>
  </div>`);
  const copy = async (i, log) => {
    const txt = box.querySelector(`[data-text="${i}"]`).value;
    await navigator.clipboard.writeText(txt).catch(() => {});
    if (log) {
      await addTouch(firma, texts[i].typ, texts[i].title, txt);
      toast('Skopiowano i zalogowano dotyk', texts[i].title);
      render();
    } else toast('Skopiowano do schowka', texts[i].title);
  };
  box.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]'); if (c) return copy(+c.dataset.copy, false);
    const cl = e.target.closest('[data-copylog]'); if (cl) return copy(+cl.dataset.copylog, true);
    if (e.target.closest('[data-close-seq]')) closeModal();
  });
}

/* ── modal kontaktu ── */
function openContactModal(firma) {
  const box = openModal(`<div class="strefa-modal__body">
    <h2 style="margin:0 0 var(--space-md)">Nowy kontakt — ${esc(firma)}</h2>
    <div class="syg-form">
      <label>Imię i nazwisko<input class="strefa-input" data-f="imie" autocomplete="off" /></label>
      <label>Stanowisko<input class="strefa-input" data-f="stanowisko" placeholder="np. CTO, VP Engineering" autocomplete="off" /></label>
      <label>LinkedIn URL<input class="strefa-input" data-f="linkedin_url" placeholder="https://www.linkedin.com/in/…" autocomplete="off" /></label>
      <label>E-mail<input class="strefa-input" data-f="email" type="email" autocomplete="off" /></label>
    </div>
    <div class="strefa-actions-row">
      <button class="strefa-btn strefa-btn--ghost" data-cancel>Anuluj</button>
      <button class="strefa-btn strefa-btn--accent" data-save>Zapisz kontakt</button>
    </div>
  </div>`);
  box.querySelector('[data-f="imie"]').focus();
  box.querySelector('[data-cancel]').addEventListener('click', closeModal);
  box.querySelector('[data-save]').addEventListener('click', async () => {
    const val = (f) => box.querySelector(`[data-f="${f}"]`).value.trim() || null;
    const imie = val('imie');
    if (!imie) { toast('Podaj imię i nazwisko', '', 'err'); return; }
    const { data, error } = await sb.from('caio_contacts')
      .insert({ firma, imie, stanowisko: val('stanowisko'), linkedin_url: val('linkedin_url'), email: val('email') })
      .select().single();
    if (error) { toast('Błąd zapisu', error.message, 'err'); return; }
    if (!contacts.has(firma)) contacts.set(firma, []);
    contacts.get(firma).push(data);
    closeModal(); render();
    toast('Kontakt zapisany', imie);
  });
}

/* ── init ── */
async function init() {
  if (!(await getTeamUser())) return; // layout przekieruje na login
  $('#search').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('#f-typ').addEventListener('change', (e) => { fTyp = e.target.value; render(); });
  $('#f-status').addEventListener('change', (e) => { fStatus = e.target.value; render(); });
  $('#due').addEventListener('click', (e) => {
    const b = e.target.closest('[data-seq]');
    if (b) openSequence(b.dataset.seq);
  });
  $('#list').addEventListener('change', (e) => {
    if (e.target.matches('[data-status]')) {
      const firma = e.target.closest('.strefa-tr').dataset.firma;
      saveCompany(firma, { status: e.target.value }).then((ok) => ok && render());
    }
  });
  $('#list').addEventListener('click', async (e) => {
    if (e.target.closest('[data-status]')) return;
    const star = e.target.closest('[data-chemia]');
    if (star) {
      const firma = star.closest('.strefa-tr').dataset.firma;
      const on = !companyOf(firma).chemia;
      if (await saveCompany(firma, { chemia: on })) { if (on) openFirms.add(firma); render(); }
      return;
    }
    const addC = e.target.closest('[data-add-contact]');
    if (addC) { openContactModal(addC.closest('.strefa-tr').dataset.firma); return; }
    const delC = e.target.closest('[data-del-contact]');
    if (delC) {
      const rowEl = delC.closest('.syg-contact');
      const firma = delC.closest('.strefa-tr').dataset.firma;
      const id = rowEl.dataset.cid;
      const { error } = await sb.from('caio_contacts').delete().eq('id', id);
      if (error) { toast('Błąd usuwania', error.message, 'err'); return; }
      contacts.set(firma, (contacts.get(firma) ?? []).filter((c) => c.id !== id));
      render();
      return;
    }
    const seq = e.target.closest('[data-seq]');
    if (seq) { openSequence(seq.dataset.seq); return; }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const id = btn.closest('.syg-row').dataset.id;
      sb.from('caio_signals').update({ status: btn.dataset.act }).eq('id', id).then(({ error }) => {
        if (error) { toast('Błąd zapisu', error.message, 'err'); return; }
        const s = signals.find((x) => x.id === id);
        if (s) s.status = btn.dataset.act;
        render();
      });
      return;
    }
    if (e.target.closest('a')) return;
    const tog = e.target.closest('.syg-toggle');
    if (tog) {
      const f = tog.closest('.strefa-tr').dataset.firma;
      openFirms.has(f) ? openFirms.delete(f) : openFirms.add(f);
      render();
    }
  });
  await load();
  const first = $('#list .strefa-tr');
  if (first && !openFirms.size) { openFirms.add(first.dataset.firma); render(); }
}
init();
