// Strona „Decydenci" strefy zamkniętej — osoby decyzyjne z firm-celów CAIO
// (caio_contacts + caio_companies + caio_signals + caio_touches) i generator
// „briefu dla LLM": kompletny kontekst do napisania e-maila otwierającego.
import { getClient, getTeamUser } from './supabase.js';
import { $, $$, esc, toast, openModal, closeModal, fmtDate, bindSearch } from './strefa-ui.js';

const sb = getClient();

let contacts = [], companies = new Map(), signalsBy = new Map(), touchesBy = new Map(), filmyKat = [];
let query = '', fWerdykt = 'produkt', fEmail = false;

/* ── kanon SZRON — dołączany do każdego briefu ── */
const KANON = `## Nadawca (kontekst stały)
Tomasz Wojciechowski — SZRON (szron.tech), Rzeszów, działa w całej Polsce (spotkania online na Teams).
Rola: zewnętrzny Chief Transformation Officer (CTrO) dla polskich producentów elektroniki z własnym firmware.
Specjalność: wdrażanie programowania agentowego (Claude Code) w zespołach embedded — legacy C++, STM32, RTOS, testy HIL, dokumentacja, ślad zgodności.
Drabina współpracy: rozmowa/audyt gotowości → warsztat (także embedded, na sprzęcie klienta) → program transformacji (Coaching Sprint AI) → stała rola CTrO.
Darmowa wartość na start (gdy pasuje): skill STM32 dla Claude Code — szron.tech/stm32-skill.
Kontekst regulacyjny: CRA — od 11.09.2026 obowiązek zgłaszania aktywnie wykorzystywanych podatności w 24h (kaskada 24h/72h/14 dni), dotyczy też produktów już na rynku; NIS2 — od 3.10.2026.

## Zasady pisania (twarde)
1. Maks. ~120 słów treści. Zero lania wody.
2. Pierwszy akapit MUSI nawiązywać do konkretnego sygnału z briefu (rekrutacja / news) — czytelnik ma widzieć, że to nie masówka.
3. Hak regulacyjny (CRA/NIS2) używaj tylko, gdy naturalnie pasuje do produktu firmy.
4. Zero buzzwordów („rewolucja AI", „transformacja cyfrowa"), zero gwarancji liczbowych, zero pakietów i cenników.
5. Jeden CTA: 20 minut rozmowy na Teams (propozycja terminu albo pytanie o dogodny).
6. Ton: inżynier do inżyniera. Po polsku. Forma „Pan/Pani"; per „Ty" tylko do founderów startupów.
7. Używaj wyłącznie faktów z briefu — niczego nie zmyślaj, nie dodawaj danych o firmie spoza briefu.
8. Temat maila: krótki, konkretny, bez clickbaitu (np. nawiązanie do rekrutacji albo CRA + nazwa produktu).
9. Podpis: Tomasz Wojciechowski · SZRON · szron.tech`;

/* ── dane ── */
async function load() {
  const [cnt, comp, sig, tch, flm] = await Promise.all([
    sb.from('caio_contacts').select('*').order('firma'),
    sb.from('caio_companies').select('*'),
    sb.from('caio_signals').select('firma,typ,tytul,url,zrodlo,waga,posted_at,created_at,status').neq('status', 'odrzucony').order('created_at', { ascending: false }),
    sb.from('caio_touches').select('firma,typ,wynik,created_at').order('created_at', { ascending: false }),
    sb.from('filmy').select('title,data'),
  ]);
  const err = cnt.error || comp.error || sig.error || tch.error;
  if (err) { toast('Błąd wczytywania', err.message, 'err'); return; }
  contacts = cnt.data ?? [];
  companies = new Map((comp.data ?? []).map((c) => [c.firma, c]));
  signalsBy = new Map(); touchesBy = new Map();
  for (const s of sig.data ?? []) { if (!signalsBy.has(s.firma)) signalsBy.set(s.firma, []); signalsBy.get(s.firma).push(s); }
  for (const t of tch.data ?? []) { if (!touchesBy.has(t.firma)) touchesBy.set(t.firma, []); touchesBy.get(t.firma).push(t); }
  filmyKat = (flm.data ?? []).map((f) => ({ title: f.title, teza: f.data?.brief?.teza ?? '' }));
  render();
  renderFilmyRank();
}

/* ── hak z kwalifikacji („… · Hak: xxx") ── */
function hakOf(comp) {
  const m = /·\s*Hak:\s*([\s\S]+)$/.exec(comp?.kwalifikacja ?? '');
  return m ? m[1].trim() : null;
}
function opisOf(comp) {
  return (comp?.kwalifikacja ?? '').replace(/\s*·\s*Hak:[\s\S]*$/, '').trim();
}

function visible() {
  const q = query.toLowerCase();
  return contacts.filter((k) => {
    const c = companies.get(k.firma);
    if (!c || c.status === 'odpadl') return false;
    if (fWerdykt && c.werdykt !== fWerdykt) return false;
    if (fEmail && !k.email) return false;
    if (q && !`${k.imie} ${k.firma} ${k.stanowisko ?? ''} ${k.email ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (b.email ? 1 : 0) - (a.email ? 1 : 0) || a.firma.localeCompare(b.firma, 'pl') || a.imie.localeCompare(b.imie, 'pl'));
}

function renderStats() {
  const prod = [...companies.values()].filter((c) => c.werdykt === 'produkt' && c.status !== 'odpadl');
  const inProd = contacts.filter((k) => prod.some((c) => c.firma === k.firma));
  const zMailem = inProd.filter((k) => k.email);
  $('#stats').innerHTML = [
    ['Firmy-produkt', prod.length], ['Decydenci', inProd.length], ['Z e-mailem', zMailem.length],
    ['Dotknięte firmy', [...companies.values()].filter((c) => !['nowy', 'odpadl'].includes(c.status)).length],
  ].map(([l, n]) => `<div class="strefa-stat"><div class="strefa-stat__num">${n}</div><div class="strefa-stat__lbl">${l}</div></div>`).join('');
}

const ICO = {
  copy: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  ext: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

function card(k, i) {
  const c = companies.get(k.firma) ?? {};
  const hak = hakOf(c);
  const sig = (signalsBy.get(k.firma) ?? [])[0];
  const tch = (touchesBy.get(k.firma) ?? [])[0];
  return `<article class="dec-card" data-i="${i}">
    <div class="dec-card__who">
      <span class="dec-card__name">${esc(k.imie)}</span>
      <span class="dec-card__firma">${esc(k.firma)}</span>
      ${c.werdykt === 'produkt' ? '<span class="syg-tier syg-w--produkt">produkt</span>' : c.werdykt ? `<span class="syg-tier">${esc(c.werdykt)}</span>` : ''}
    </div>
    ${k.stanowisko ? `<div class="dec-card__pos">${esc(k.stanowisko)}</div>` : ''}
    ${c.kwalifikacja ? `<div class="dec-card__kwal">${esc(opisOf(c).slice(0, 220))}${opisOf(c).length > 220 ? '…' : ''}</div>` : ''}
    ${hak ? `<div class="dec-card__hak">🎯 ${esc(hak)}</div>` : ''}
    ${c.pitch ? `<div class="dec-card__pitch">🎬 ${esc(c.pitch)}</div>` : ''}
    <div class="dec-card__links">
      ${k.email ? `<a href="mailto:${esc(k.email)}">${ICO.mail} ${esc(k.email)}</a>` : k.email_probe_at ? `<span class="dec-noemail">nie znaleziono e-maila (Prospeo ${fmtDate(k.email_probe_at)}, ponowi za ~2 tyg.)</span>` : '<span class="dec-noemail">e-mail w drodze (Prospeo)…</span>'}
      ${k.linkedin_url ? `<a href="${esc(k.linkedin_url)}" target="_blank" rel="noopener">LinkedIn ${ICO.ext}</a>` : ''}
      ${c.www ? `<a href="${esc(c.www)}" target="_blank" rel="noopener">www ${ICO.ext}</a>` : ''}
    </div>
    <div class="dec-card__meta">
      ${sig ? `ostatni sygnał: ${esc(sig.tytul.replace(/\s+—\s+[^—]+$/, '').slice(0, 70))} (${fmtDate(sig.posted_at || sig.created_at)})` : 'brak aktywnych sygnałów'}
      ${tch ? ` · ostatni dotyk: ${esc(tch.typ)} ${fmtDate(tch.created_at)}` : ' · nie dotknięta'}
    </div>
    <div class="dec-card__actions">
      <button class="strefa-btn strefa-btn--accent strefa-btn--sm" data-brief="${i}">${ICO.copy} Brief dla LLM</button>
      ${k.email ? `<button class="strefa-btn strefa-btn--ghost strefa-btn--sm" data-mail="${i}">${ICO.copy} E-mail</button>` : ''}
      <a class="strefa-btn strefa-btn--ghost strefa-btn--sm" href="/strefa/sygnaly">Sygnały →</a>
    </div>
  </article>`;
}

/* ── brief dla LLM ── */
function briefFor(k) {
  const c = companies.get(k.firma) ?? {};
  const sygnaly = (signalsBy.get(k.firma) ?? []).slice(0, 5);
  const dotyki = (touchesBy.get(k.firma) ?? []).slice(0, 6);
  const inni = contacts.filter((x) => x.firma === k.firma && x.imie !== k.imie);
  return `# Brief: e-mail otwierający do ${k.imie} (${k.firma})

${KANON}

## Adresat
- ${k.imie}${k.stanowisko ? ` — ${k.stanowisko}` : ''}
- E-mail: ${k.email ?? 'BRAK (najpierw zdobądź adres)'}
${k.linkedin_url ? `- LinkedIn: ${k.linkedin_url}` : ''}
${inni.length ? `- Inne osoby w firmie: ${inni.map((x) => `${x.imie}${x.stanowisko ? ` (${String(x.stanowisko).slice(0, 40)})` : ''}`).join('; ')}` : ''}

## Firma
- ${k.firma}${c.www ? ` — ${c.www}` : ''}${c.werdykt ? ` · werdykt: ${c.werdykt}` : ''}${c.status ? ` · status pipeline: ${c.status}` : ''}
- ${opisOf(c) || 'brak opisu'}
${hakOf(c) ? `- HAK (użyj jako oś maila): ${hakOf(c)}` : ''}
${c.pitch ? `- CO ICH MOŻE ZAINTERESOWAĆ I KTÓRY FILM POKAZAĆ: ${c.pitch}` : ''}

${c.dossier ? `## Dossier\n${c.dossier}\n` : ''}
## Świeże sygnały (dowód, że to nie masówka)
${sygnaly.length ? sygnaly.map((s) => `- [${s.typ}] ${s.tytul} (${s.zrodlo ?? ''}, ${fmtDate(s.posted_at || s.created_at)}) ${s.url}`).join('\n') : '- brak — oprzyj personalizację na opisie firmy i haku'}

## Historia kontaktu
${dotyki.length ? dotyki.map((t) => `- ${fmtDate(t.created_at)}: ${t.typ}${t.wynik ? ` → ${t.wynik}` : ''}`).join('\n') : '- pierwszy kontakt (nie było żadnych dotyków)'}

## Zadanie
Napisz e-mail otwierający po polsku do tej osoby zgodnie z zasadami powyżej. Zwróć: (1) temat, (2) treść, (3) jedną alternatywną wersję pierwszego akapitu.`;
}

async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast('Skopiowano', label, 'ok'); }
  catch { toast('Błąd', 'Nie udało się skopiować', 'err'); }
}

function briefModal(k) {
  const brief = briefFor(k);
  const box = openModal(`<div class="strefa-modal__head"><div><h2>Brief dla LLM — ${esc(k.imie)}</h2><p>Wklej w sesję Claude/LLM, który napisze e-mail. Zasady pisania są w środku.</p></div><button class="strefa-iconbtn" data-close-x>${ICO.x}</button></div>
    <div class="strefa-modal__body">
      <div class="dec-brief">${esc(brief)}</div>
      <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost" data-close-x>Zamknij</button>
      <button class="strefa-btn strefa-btn--accent" id="b-copy">${ICO.copy} Kopiuj brief</button></div>
    </div>`);
  box.querySelectorAll('[data-close-x]').forEach((b) => b.addEventListener('click', closeModal));
  $('#b-copy', box).addEventListener('click', () => copy(brief, 'Brief — wklej do LLM'));
}

function zasadyModal() {
  const box = openModal(`<div class="strefa-modal__head"><div><h2>Zasady pisania (kanon LLM)</h2><p>Ten blok jest dołączany do każdego briefu</p></div><button class="strefa-iconbtn" data-close-x>${ICO.x}</button></div>
    <div class="strefa-modal__body"><div class="dec-brief">${esc(KANON)}</div>
    <div class="strefa-actions-row"><button class="strefa-btn strefa-btn--ghost" data-close-x>Zamknij</button>
    <button class="strefa-btn strefa-btn--accent" id="z-copy">${ICO.copy} Kopiuj</button></div></div>`);
  box.querySelectorAll('[data-close-x]').forEach((b) => b.addEventListener('click', closeModal));
  $('#z-copy', box).addEventListener('click', () => copy(KANON, 'Kanon pisania'));
}

/* ── ranking filmów: które nakręcić najpierw (z pitchów firm-produkt) ── */
function renderFilmyRank() {
  const box = $('#filmy-rank'); if (!box) return;
  const prod = [...companies.values()].filter((c) => c.werdykt === 'produkt' && c.status !== 'odpadl' && c.pitch);
  const norm = (s) => String(s).toLowerCase().replace(/[„”"'’]/g, '').replace(/\s+/g, ' ');
  const rank = filmyKat
    .map((f) => {
      const t = norm(f.title.replace(/^short:\s*/i, '')).replace(/\.$/, '');
      const firmy = prod.filter((c) => norm(c.pitch).includes(t));
      return { ...f, firmy };
    })
    .filter((f) => f.firmy.length)
    .sort((a, b) => b.firmy.length - a.firmy.length || a.title.localeCompare(b.title, 'pl'));
  box.hidden = !rank.length;
  $('#filmy-rank-list').innerHTML = rank.map((f) => `<li>
    <div class="frank__head"><strong>${esc(f.title)}</strong><span class="frank__count">${f.firmy.length} ${f.firmy.length === 1 ? 'firma czeka' : f.firmy.length < 5 ? 'firmy czekają' : 'firm czeka'}</span></div>
    ${f.teza ? `<div class="frank__teza">${esc(f.teza)}</div>` : ''}
    <div class="frank__firmy">${f.firmy.map((c) => esc(c.firma)).join(' · ')}</div>
  </li>`).join('');
}

function render() {
  renderStats();
  const list = visible();
  $('#list').innerHTML = list.map((k, i) => card(k, i)).join('');
  $('#empty').hidden = list.length !== 0;
  $$('#list [data-brief]').forEach((b) => b.addEventListener('click', () => briefModal(list[+b.dataset.brief])));
  $$('#list [data-mail]').forEach((b) => b.addEventListener('click', () => copy(list[+b.dataset.mail].email, 'Adres e-mail')));
}

/* ── start ── */
async function init() {
  if (!(await getTeamUser())) return;
  bindSearch('#search', (q) => { query = q; render(); });
  $('#f-werdykt').addEventListener('change', (e) => { fWerdykt = e.target.value; render(); });
  $('#f-email').addEventListener('change', (e) => { fEmail = e.target.checked; render(); });
  $('#btn-zasady').addEventListener('click', zasadyModal);
  await load();
}
init();
