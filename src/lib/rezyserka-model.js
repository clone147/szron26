// Model Reżyserki (port z lokalnej appki szron-rezyserka do strefy).
// Jedna prawda o filmie żyje w strefa.filmy.data = { nr, status, brief, long, short, diagramy }.
// Sceny leżą sekwencyjnie (start = suma poprzednich), czas bitu liczony z tempa lektora (wpm).
// Tu też mieszka dwukierunkowe mapowanie film ⇄ kształty diagramu (nowy typ „scenopis"):
// diagram.data.film = { id, wariant }, a kształty niosą meta `film: { rola, scena?, nak? }`.

export const STATUSY = ['zarys', 'rozpisany', 'nagrany', 'montaz', 'gotowy'];
export const RODZAJE_SCEN = ['hook', 'bol', 'smiech', 'zwrot', 'setup', 'demo', 'point', 'cta', 'petla', 'inne'];
export const UJECIA = ['ekran', 'pip', 'pelna-klatka', 'broll', 'kamera', 'telefon'];
export const RODZAJE_NAKLADEK = ['karta', 'chip', 'stempel', 'licznik', 'diagram', 'rozdzial', 'lockup', 'napisy'];
export const POZYCJE = ['gora', 'gora-lewo', 'gora-prawo', 'srodek', 'dol', 'dol-lewo', 'dol-prawo', 'pelny'];

export const uid = () => Math.random().toString(36).slice(2, 9);
const seed = () => (Math.random() * 1e9) | 0;

/* ── czas ── */
const PAUZA_KROPKA = 0.35, PAUZA_PRZECINEK = 0.15;
export const round1 = (n) => Math.round(n * 10) / 10;

// Ile sekund zajmie wypowiedzenie tekstu przy danym tempie (słowa/min) + pauzy interpunkcji.
export function szacujCzas(tekst, wpm) {
  const slowa = String(tekst).trim().split(/\s+/).filter(Boolean).length;
  if (!slowa) return 0;
  const kropki = (tekst.match(/[.!?…]/g) ?? []).length;
  const przecinki = (tekst.match(/[,;:—–]/g) ?? []).length;
  return round1((slowa / wpm) * 60 + kropki * PAUZA_KROPKA + przecinki * PAUZA_PRZECINEK);
}
export const czasBitu = (bit, wpm) => (bit.reczny ? bit.dur : szacujCzas(bit.tekst, wpm));
export const czasNarracji = (scena, wpm) => round1(scena.bity.reduce((s, b) => s + czasBitu(b, wpm), 0));
// Czas sceny = zadeklarowana długość, ale narracja nie może wypaść poza kadr.
export const czasSceny = (scena, wpm) => round1(Math.max(czasNarracji(scena, wpm), scena.dur));
export function startyScen(w) {
  const out = [];
  let t = 0;
  for (const s of w.sceny) { out.push(round1(t)); t += czasSceny(s, w.wpm); }
  return out;
}
export const czasWariantu = (w) => round1(w.sceny.reduce((s, sc) => s + czasSceny(sc, w.wpm), 0));

// 92.4 → "1:32"; z opcją dziesiętnych "1:32,4"
export function mmss(sec, dziesietne = false) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const reszta = s - m * 60;
  const ss = Math.floor(reszta);
  const pad = String(ss).padStart(2, '0');
  if (!dziesietne) return `${m}:${pad}`;
  return `${m}:${pad},${Math.round((reszta - ss) * 10)}`;
}

/* ── kręgosłup: stały szkielet sekcji, ten sam w każdym odcinku ── */
const LONG = [
  { klucz: 'hook', tytul: 'HOOK / ZIMNE OTWARCIE', rodzaj: 'hook', dur: 30, wskazowka: 'Zimne wejście w środek akcji — pierwsze zdanie stawia stawkę. Bez przywitania.' },
  { klucz: 'bol', tytul: 'BÓL / ŚMIECH', rodzaj: 'bol', dur: 70, wskazowka: 'Koszt starego sposobu, na konkrecie. Widz ma się rozpoznać i uśmiechnąć.' },
  { klucz: 'zwrot', tytul: 'ZWROT', rodzaj: 'zwrot', dur: 35, wskazowka: 'Moment „a jednak" — teza pod prąd wywraca to, co przed chwilą było oczywiste.' },
  { klucz: 'setup', tytul: 'SETUP', rodzaj: 'setup', dur: 60, wskazowka: 'Warunki eksperymentu: sprzęt, model, reguły gry. Widz musi wiedzieć, co się liczy.' },
  { klucz: 'demo-a', tytul: 'DEMO A', rodzaj: 'demo', dur: 85, wskazowka: 'Pierwszy dowód na ekranie — najprostszy, żeby wciągnąć.' },
  { klucz: 'demo-b', tytul: 'DEMO B', rodzaj: 'demo', dur: 85, wskazowka: 'Podbicie stawki: trudniejszy przypadek, więcej dzieje się w kadrze.' },
  { klucz: 'demo-c', tytul: 'DEMO C', rodzaj: 'demo', dur: 85, wskazowka: 'Rdzeń odcinka — najmocniejszy dowód, ten, po który widz przyszedł.' },
  { klucz: 'point', tytul: 'POINT + LUKA', rodzaj: 'point', dur: 60, wskazowka: 'Spłata kotwicy z briefu plus jawna luka, która zapowiada następny odcinek.' },
  { klucz: 'cta', tytul: 'CTA', rodzaj: 'cta', dur: 30, wskazowka: 'Jedno wezwanie, nie trzy.' },
];
const SHORT = [
  { klucz: 'hook', tytul: 'HOOK / PIERWSZA KLATKA', rodzaj: 'hook', dur: 2, wskazowka: 'Pierwsza sekunda rozstrzyga — obraz i zdanie naraz, zero rozbiegu.' },
  { klucz: 'stawka', tytul: 'KONTEKST / STAWKA', rodzaj: 'bol', dur: 6, wskazowka: 'Dla kogo to i co jest do wygrania. Tuż po hooku wypada najwięcej widzów.' },
  { klucz: 'payoff', tytul: 'PAYOFF', rodzaj: 'point', dur: 19, wskazowka: 'Dowód i rozwiązanie. Eskaluj zamiast tłumaczyć — środek bez podbicia gasi retencję.' },
  { klucz: 'petla', tytul: 'PĘTLA', rodzaj: 'petla', dur: 3, wskazowka: 'Ostatnia klatka wraca do pierwszej — zapętlenie liczy się jak nowe wyświetlenie.' },
];
export const KREGOSLUP = { long: LONG, short: SHORT };
const suma = (k) => KREGOSLUP[k].reduce((s, x) => s + x.dur, 0);
export const DOMYSLNY_WARIANT = {
  long: { format: '16:9', fps: 30, targetSec: suma('long'), wpm: 145 },
  short: { format: '9:16', fps: 30, targetSec: suma('short'), wpm: 150 },
};

const zSekcji = (s) => ({ id: uid(), tytul: s.tytul, rodzaj: s.rodzaj, dur: s.dur, sekcja: s.klucz, bity: [], obraz: [], nakladki: [] });
export const sekcja = (klucz, ktory) => (klucz ? KREGOSLUP[ktory].find((s) => s.klucz === klucz) : undefined);
export const brakujaceSekcje = (w, ktory) => KREGOSLUP[ktory].filter((s) => !w.sceny.some((x) => x.sekcja === s.klucz));

// Dostawia brakujące sekcje na ich miejsce w szkielecie, nie ruszając reszty.
export function uzupelnijKregoslup(w, ktory) {
  const szkielet = KREGOSLUP[ktory];
  const sceny = [...w.sceny];
  szkielet.forEach((s, i) => {
    if (sceny.some((x) => x.sekcja === s.klucz)) return;
    const dalsze = new Set(szkielet.slice(i + 1).map((x) => x.klucz));
    const przed = sceny.findIndex((x) => x.sekcja && dalsze.has(x.sekcja));
    if (przed < 0) sceny.push(zSekcji(s));
    else sceny.splice(przed, 0, zSekcji(s));
  });
  return { ...w, sceny };
}
export const wariantZKregoslupem = (ktory) => ({ ...DOMYSLNY_WARIANT[ktory], sceny: KREGOSLUP[ktory].map(zSekcji) });

export const nowyFilm = () => ({
  status: 'zarys', brief: {}, long: wariantZKregoslupem('long'), short: wariantZKregoslupem('short'), diagramy: {},
});

// Wyrozumiała normalizacja (film.data pisze też agent z terminala) — braki dostają domyślne.
export function normalizujFilm(data) {
  const d = data && typeof data === 'object' ? data : {};
  const wariant = (w, ktory) => {
    const base = { ...DOMYSLNY_WARIANT[ktory], sceny: [], ...(w && typeof w === 'object' ? w : {}) };
    base.sceny = (Array.isArray(base.sceny) ? base.sceny : []).map((s) => ({
      id: typeof s.id === 'string' && s.id ? s.id : uid(),
      tytul: typeof s.tytul === 'string' ? s.tytul : 'Nowa scena',
      rodzaj: RODZAJE_SCEN.includes(s.rodzaj) ? s.rodzaj : 'inne',
      ...(s.sekcja ? { sekcja: s.sekcja } : {}),
      dur: Number.isFinite(+s.dur) ? Math.max(1, +s.dur) : 10,
      ...(s.notatka ? { notatka: s.notatka } : {}),
      bity: (Array.isArray(s.bity) ? s.bity : []).map((b) => ({
        id: typeof b.id === 'string' && b.id ? b.id : uid(),
        tekst: typeof b.tekst === 'string' ? b.tekst : '',
        dur: Number.isFinite(+b.dur) ? +b.dur : 0,
        ...(b.reczny ? { reczny: true } : {}), ...(b.rezyseria ? { rezyseria: b.rezyseria } : {}),
      })),
      obraz: (Array.isArray(s.obraz) ? s.obraz : []).map((o) => ({
        id: typeof o.id === 'string' && o.id ? o.id : uid(),
        t: Number.isFinite(+o.t) ? +o.t : 0, dur: Number.isFinite(+o.dur) ? +o.dur : 5,
        ujecie: UJECIA.includes(o.ujecie) ? o.ujecie : 'ekran',
        opis: typeof o.opis === 'string' ? o.opis : '',
      })),
      nakladki: (Array.isArray(s.nakladki) ? s.nakladki : []).map((n) => ({
        id: typeof n.id === 'string' && n.id ? n.id : uid(),
        t: Number.isFinite(+n.t) ? +n.t : 0, dur: Number.isFinite(+n.dur) ? +n.dur : 3,
        rodzaj: RODZAJE_NAKLADEK.includes(n.rodzaj) ? n.rodzaj : 'karta',
        tekst: typeof n.tekst === 'string' ? n.tekst : '',
        pozycja: POZYCJE.includes(n.pozycja) ? n.pozycja : 'dol',
        ...(n.uwagi ? { uwagi: n.uwagi } : {}),
      })),
    }));
    return base;
  };
  return {
    ...(Number.isFinite(+d.nr) && d.nr !== null && d.nr !== '' ? { nr: +d.nr } : {}),
    status: STATUSY.includes(d.status) ? d.status : 'zarys',
    brief: d.brief && typeof d.brief === 'object' ? d.brief : {},
    long: wariant(d.long, 'long'),
    short: wariant(d.short, 'short'),
    diagramy: d.diagramy && typeof d.diagramy === 'object' ? d.diagramy : {},
  };
}

/* ── linter: reguły playbooka kanału ── */
export function sprawdz(film) {
  return [...sprawdzWariant(film.long, 'long', film), ...sprawdzWariant(film.short, 'short', film)];
}
function sprawdzWariant(w, ktory, film) {
  const u = [];
  const dodaj = (poziom, tekst, scenaId) => u.push({ poziom, tekst, scenaId, wariant: ktory });
  if (!w.sceny.length) {
    if (film.status !== 'zarys') dodaj('ostrzezenie', `Wariant ${ktory} nie ma jeszcze żadnej sceny.`);
    return u;
  }
  const sumaW = czasWariantu(w);
  const odchylka = (sumaW - w.targetSec) / w.targetSec;
  if (Math.abs(odchylka) > 0.15) {
    dodaj(Math.abs(odchylka) > 0.3 ? 'blad' : 'ostrzezenie',
      `${mmss(sumaW)} przy celu ${mmss(w.targetSec)} — ${odchylka > 0 ? 'za długo' : 'za krótko'} o ${mmss(Math.abs(sumaW - w.targetSec))}.`);
  }
  const hook = w.sceny[0];
  const durHook = czasSceny(hook, w.wpm);
  const limitHooka = ktory === 'short' ? 5 : 30;
  if (hook.rodzaj !== 'hook') dodaj('ostrzezenie', 'Pierwsza scena nie jest oznaczona jako HOOK.', hook.id);
  else if (durHook > limitHooka) dodaj('ostrzezenie', `Hook trwa ${mmss(durHook, true)} — limit to ${limitHooka} s.`, hook.id);
  if (ktory === 'long' && film.brief.kotwica && !w.sceny.some((s) => s.rodzaj === 'point')) {
    dodaj('ostrzezenie', 'Kotwica z briefu nie ma sceny spłaty (żadna scena nie jest POINT).');
  }
  const braki = brakujaceSekcje(w, ktory);
  if (braki.length) dodaj('info', `Brakuje sekcji kręgosłupa: ${braki.map((s) => s.tytul).join(', ')}.`);
  if (poprzestawiane(w, ktory)) dodaj('info', 'Sekcje kręgosłupa idą w innej kolejności niż szkielet odcinka.');
  const ostatnia = w.sceny[w.sceny.length - 1];
  if (ktory === 'short' && ostatnia.rodzaj !== 'petla') {
    dodaj('info', 'Short nie kończy się PĘTLĄ — ostatnia klatka powinna wracać do pierwszej.', ostatnia.id);
  }
  for (const s of w.sceny) {
    const dur = czasSceny(s, w.wpm);
    for (const n of s.nakladki) {
      if (n.t + n.dur > dur + 0.05) dodaj('blad', `Nakładka „${skroc(n.tekst)}" wychodzi poza scenę „${s.tytul}" o ${round1(n.t + n.dur - dur)} s.`, s.id);
      if (n.rodzaj === 'napisy') {
        dodaj('ostrzezenie', `Nakładka „${skroc(n.tekst)}" to napisy — reguła kanału: nakładka dodaje informację, nie dubluje lektora.`, s.id);
      } else if (dubluje(n.tekst, s.bity.map((b) => b.tekst).join(' '))) {
        dodaj('ostrzezenie', `Nakładka „${skroc(n.tekst)}" powtarza słowa narracji w tej scenie.`, s.id);
      }
      if (ktory === 'short' && n.pozycja === 'dol' && n.rodzaj !== 'lockup') {
        dodaj('info', `Short: „${skroc(n.tekst)}" jest na dole — trzymaj 220 px zapasu (UI TikToka/Shorts).`, s.id);
      }
    }
    for (const o of s.obraz) {
      if (o.t + o.dur > dur + 0.05) dodaj('blad', `Blok obrazu „${skroc(o.opis)}" wychodzi poza scenę „${s.tytul}".`, s.id);
    }
    const narracja = czasNarracji(s, w.wpm);
    if (narracja > s.dur + 0.05) {
      dodaj('info', `Scena „${s.tytul}": narracja (${round1(narracja)} s) nie mieści się w zadeklarowanych ${round1(s.dur)} s — rozciągnąłem scenę.`, s.id);
    }
    if (!s.bity.length && !s.obraz.length && !(s.sekcja && film.status === 'zarys')) {
      dodaj('info', `Scena „${s.tytul}" jest pusta — ani narracji, ani obrazu.`, s.id);
    }
    if (dur > 150) dodaj('info', `Scena „${s.tytul}" trwa ${mmss(dur)} — rozważ podział.`, s.id);
  }
  return u;
}
function poprzestawiane(w, ktory) {
  const wzorzec = KREGOSLUP[ktory].map((s) => s.klucz);
  const obecne = w.sceny.map((s) => s.sekcja).filter((k) => !!k && wzorzec.includes(k));
  const posortowane = [...obecne].sort((a, b) => wzorzec.indexOf(a) - wzorzec.indexOf(b));
  return obecne.some((k, i) => k !== posortowane[i]);
}
const skroc = (t, n = 32) => { const s = String(t).trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
// Prosty test dublowania: ≥4 wspólne słowa dłuższe niż 4 znaki.
function dubluje(nakladka, narracja) {
  const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 4);
  const a = new Set(norm(nakladka));
  if (a.size < 4) return false;
  let wspolne = 0;
  for (const w of norm(narracja)) if (a.has(w)) wspolne++;
  return wspolne >= 4;
}

/* ── mapowanie film ⇄ diagram (nowy typ „scenopis") ──
   Kształty diagramu niosą meta `film`:
   - rect  { film: { rola: 'scena', scena: <id> } } — karta sceny; text = tytuł + linia "⏱ N s"
   - text  { film: { rola: 'bity', scena } }        — narracja sceny, zdanie na linię
   - text  { film: { rola: 'nakladka', scena, nak } } — treść nakładki ("▸ …")
   - arrow { film: { rola: 'lacznik' } }            — łańcuch kolejności (przebudowywany)
   - text  { film: { rola: 'naglowek' } }           — tytuł filmu (ignorowany przy imporcie)
   Rect BEZ meta = nowa scena (id pochodny 'd-'+shape.id — stabilny między importami). */

const W_SCENA = 430, ODSTEP_X = 560, LINIA = 43;
// Szacunek linii po zawinięciu (Caveat 36px, zawijanie do w-16; ~14.4 px na znak).
function linie(text, w) {
  const naLinie = Math.max(8, Math.floor((w - 16) / 14.4));
  return String(text).split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / naLinie)), 0);
}
const tekstSceny = (s) => `${s.tytul}\n⏱ ${round1(s.dur)} s`;
const hRect = (s) => Math.max(130, linie(tekstSceny(s), W_SCENA) * LINIA + 56);
const hTekst = (t) => Math.max(56, linie(t, W_SCENA) * LINIA + 26);

// Film (jeden wariant) → kształty diagramu. `stare` = obecne kształty (pozycje przeżywają update).
export function filmDoShapes(film, ktory, stare = []) {
  const w = film[ktory];
  const zMeta = stare.filter((s) => s.film && typeof s.film === 'object');
  const bezMeta = stare.filter((s) => !s.film || typeof s.film !== 'object');
  const znajdz = (rola, scena, nak) => zMeta.find((s) => s.film.rola === rola && (scena === undefined || s.film.scena === scena) && (nak === undefined || s.film.nak === nak));
  // rect adoptowany: scena powstała z gołego prostokąta (id pochodny 'd-'+shape.id)
  const adoptuj = (scenaId) => (scenaId.startsWith('d-') ? bezMeta.find((s) => s.type === 'rect' && 'd-' + s.id === scenaId) : undefined);

  const out = [];
  const uzyte = new Set(); // kształty bez meta zaadoptowane jako sceny
  // nagłówek
  const naglowek = znajdz('naglowek');
  const tytulTekst = `${film.tytul ?? ''} — ${ktory === 'long' ? 'long 16:9' : 'short 9:16'} · cel ${mmss(w.targetSec)}`;
  out.push(naglowek
    ? { ...naglowek, text: tytulTekst }
    : { id: uid(), type: 'text', x: 0, y: -150, w: 940, h: 60, seed: seed(), text: tytulTekst, film: { rola: 'naglowek' } });

  const rects = [];
  let nextX = 0, bazaY = 0;
  const istniejaceRecty = w.sceny.map((s) => znajdz('scena', s.id) || adoptuj(s.id)).filter(Boolean);
  if (istniejaceRecty.length) {
    nextX = Math.max(...istniejaceRecty.map((r) => r.x)) + ODSTEP_X;
    bazaY = istniejaceRecty[istniejaceRecty.length - 1].y;
  }
  for (const s of w.sceny) {
    let rect = znajdz('scena', s.id) || adoptuj(s.id);
    if (rect && !rect.film) uzyte.add(rect.id);
    if (!rect) { rect = { id: uid(), type: 'rect', x: nextX, y: bazaY, w: W_SCENA, h: 0, seed: seed() }; nextX += ODSTEP_X; }
    rect = { ...rect, text: tekstSceny(s), h: Math.max(rect.h || 0, hRect(s)), film: { rola: 'scena', scena: s.id } };
    rects.push(rect);
    out.push(rect);
    // narracja pod kartą sceny (tylko gdy są bity; skasowanie całego tekstu czyści bity)
    const tekstBitow = s.bity.map((b) => b.tekst).join('\n');
    const staryBity = znajdz('bity', s.id);
    if (s.bity.length) {
      out.push(staryBity
        ? { ...staryBity, text: tekstBitow, h: Math.max(staryBity.h, hTekst(tekstBitow)) }
        : { id: uid(), type: 'text', x: rect.x, y: rect.y + rect.h + 36, w: W_SCENA, h: hTekst(tekstBitow), seed: seed(), text: tekstBitow, film: { rola: 'bity', scena: s.id } });
    }
    // nakładki — po jednym polu tekstowym
    let nakY = rect.y + rect.h + 36 + (s.bity.length ? hTekst(tekstBitow) + 14 : 0);
    for (const n of s.nakladki) {
      const t = `▸ ${n.tekst}`;
      const staryNak = znajdz('nakladka', s.id, n.id);
      out.push(staryNak
        ? { ...staryNak, text: t }
        : { id: uid(), type: 'text', x: rect.x, y: nakY, w: W_SCENA, h: hTekst(t), seed: seed(), text: t, film: { rola: 'nakladka', scena: s.id, nak: n.id } });
      nakY += hTekst(t) + 10;
    }
  }
  // łańcuch strzałek między kolejnymi scenami (końcówki i tak przelicza bindowanie)
  for (let i = 0; i + 1 < rects.length; i++) {
    const a = rects[i], b = rects[i + 1];
    out.push({
      id: uid(), type: 'arrow', seed: seed(),
      x: a.x + a.w, y: a.y + a.h / 2, w: b.x - (a.x + a.w), h: b.y + b.h / 2 - (a.y + a.h / 2),
      startBind: a.id, endBind: b.id, film: { rola: 'lacznik' },
    });
  }
  // wolne kształty użytkownika (adnotacje) zostają nietknięte
  return [...bezMeta.filter((s) => !uzyte.has(s.id)), ...out];
}

// Kształty diagramu → sceny wariantu. `film[ktory].sceny` służy do zachowania pól,
// których diagram nie zna (rodzaj, sekcja, obraz, czasy nakładek, reżyseria bitów).
export function shapesDoScen(shapes, film, ktory) {
  const stare = new Map(film[ktory].sceny.map((s) => [s.id, s]));
  const meta = (s) => (s.film && typeof s.film === 'object' ? s.film : null);
  const rects = shapes.filter((s) => s.type === 'rect' && (!meta(s) || meta(s).rola === 'scena'));
  // porządek wierszowy: klaster po środku Y (tolerancja ±300), w wierszu po X
  const rows = [];
  for (const r of [...rects].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2))) {
    const cy = r.y + r.h / 2;
    const row = rows.find((x) => Math.abs(x.cy - cy) <= 300);
    if (row) { row.items.push(r); row.cy = (row.cy * (row.items.length - 1) + cy) / row.items.length; }
    else rows.push({ cy, items: [r] });
  }
  const uporz = rows.flatMap((r) => r.items.sort((a, b) => a.x - b.x));

  const widziane = new Set();
  const sceny = [];
  for (const rect of uporz) {
    const id = meta(rect)?.scena ?? 'd-' + rect.id;
    if (widziane.has(id)) continue; // ⌘V duplikat karty sceny — liczy się pierwsza
    widziane.add(id);
    const s = stare.get(id);
    // tytuł + deklarowany czas z tekstu prostokąta (linia "⏱ N s")
    const wiersze = String(rect.text ?? '').split('\n');
    let dur = s?.dur ?? 15;
    const tytulLinie = [];
    for (const ln of wiersze) {
      const m = ln.trim().match(/^⏱\s*([\d]+(?:[.,]\d+)?)\s*s?$/);
      if (m) dur = Math.max(1, parseFloat(m[1].replace(',', '.')));
      else tytulLinie.push(ln);
    }
    const tytul = tytulLinie.join('\n').trim() || s?.tytul || 'Scena';
    // narracja: pole „bity" tej sceny; brak pola = bity bez zmian, puste pole = czyści
    const bityShape = shapes.find((x) => x.type === 'text' && meta(x)?.rola === 'bity' && meta(x).scena === id);
    let bity = s?.bity ?? [];
    if (bityShape) {
      const linie2 = String(bityShape.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      bity = linie2.map((tekst, i) => {
        const b = (s?.bity ?? [])[i];
        return b ? { ...b, tekst } : { id: `${id}-b${i}`, tekst, dur: 0 };
      });
    }
    // nakładki: tylko aktualizacja treści (czasy/pozycje zna wyłącznie reżyserka)
    const nakladki = (s?.nakladki ?? []).map((n) => {
      const shp = shapes.find((x) => x.type === 'text' && meta(x)?.rola === 'nakladka' && meta(x).scena === id && meta(x).nak === n.id);
      if (!shp) return n;
      return { ...n, tekst: String(shp.text ?? '').replace(/^▸\s*/, '').trim() };
    });
    sceny.push(s
      ? { ...s, tytul, dur, bity, nakladki }
      : { id, tytul, rodzaj: 'inne', dur, bity, obraz: [], nakladki });
  }
  return sceny;
}

// Kanoniczna projekcja tego, co diagram może zmienić — do taniego porównania „czy import coś wnosi".
export const projekcjaScen = (sceny) => JSON.stringify(sceny.map((s) => [
  s.id, s.tytul, round1(s.dur), s.bity.map((b) => b.tekst), s.nakladki.map((n) => [n.id, n.tekst]),
]));
