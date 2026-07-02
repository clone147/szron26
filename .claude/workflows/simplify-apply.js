export const meta = {
  name: 'simplify-apply',
  description: 'Zastosuj zweryfikowane uproszczenia: wspólne moduły strefy, komponenty stron, CSS, wydajność',
  phases: [
    { title: 'Runda 1', detail: 'strefa-libs + CSS + komponenty stron (rozłączne pliki)' },
    { title: 'Runda 2', detail: 'slajdy + wydajność (fonty, cache, dynamic import)' },
  ],
}

const S = args.scratchpad
const COMMON = `
Pracujesz w repo /Users/tomek/Desktop/Hot/temp/Szron.new (Astro 5 SSG, strona produkcyjna; /strefa = vanilla JS + Supabase realtime, schema 'strefa').
ZASADY TWARDE:
- Zachowanie ma zostać IDENTYCZNE 1:1. Żadnych zmian treści/copy (polskie teksty nietykalne).
- Styl kodu: dopasuj się do istniejącego (zwięzły, polskie komentarze, template literals).
- Edytuj TYLKO pliki ze swojego zakresu. NIE commituj do gita. NIE uruchamiaj npm run build (koliduje z innymi agentami — build robi orkiestrator).
- Po edycji każdego pliku .js uruchom: node --check <plik>.
- Znaleziska do zastosowania masz w pliku JSON (przeczytaj go W CAŁOŚCI — pole "proposal" zawiera już korekty adwersaryjnych weryfikatorów, a "verifierNote" pułapki, które MUSISZ uszanować). Jeśli w trakcie pracy odkryjesz, że któreś znalezisko jednak łamie zachowanie — pomiń je i odnotuj w raporcie, zamiast ryzykować.
- Zwróć raport strukturalny.`

const REPORT = {
  type: 'object', required: ['applied', 'skipped', 'newFiles', 'notes'], additionalProperties: false,
  properties: {
    applied: { type: 'array', items: { type: 'object', required: ['idx', 'title'], additionalProperties: false, properties: { idx: { type: 'number' }, title: { type: 'string' }, detail: { type: 'string' } } } },
    skipped: { type: 'array', items: { type: 'object', required: ['idx', 'reason'], additionalProperties: false, properties: { idx: { type: 'number' }, reason: { type: 'string' } } } },
    newFiles: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const RECIPE = {
  type: 'object', required: ['components', 'convertedFiles', 'remainingFiles', 'recipe'], additionalProperties: false,
  properties: {
    components: { type: 'array', items: { type: 'object', required: ['path', 'usage'], additionalProperties: false, properties: { path: { type: 'string' }, usage: { type: 'string', description: 'dokładny przykład użycia z propsami' } } } },
    convertedFiles: { type: 'array', items: { type: 'string' } },
    remainingFiles: { type: 'array', items: { type: 'string' }, description: 'pliki stron do konwersji przez agentów batchowych' },
    recipe: { type: 'string', description: 'kompletna instrukcja konwersji dla agentów batchowych: wzorce szukania, dokładne mapowanie na komponenty, pułapki' },
  },
}

const BATCH = {
  type: 'object', required: ['converted', 'skipped'], additionalProperties: false,
  properties: {
    converted: { type: 'array', items: { type: 'object', required: ['file', 'blocks'], additionalProperties: false, properties: { file: { type: 'string' }, blocks: { type: 'number' } } } },
    skipped: { type: 'array', items: { type: 'object', required: ['file', 'reason'], additionalProperties: false, properties: { file: { type: 'string' }, reason: { type: 'string' } } } },
  },
}

phase('Runda 1')
log('Runda 1: strefa-libs, CSS, komponenty stron — równolegle')

const round1 = await parallel([
  // A — biblioteki strefy
  () => agent(COMMON + `
ZAKRES PLIKÓW: src/lib/strefa-szkolenia.js, src/lib/strefa-programisci.js, src/lib/strefa-slajdy.js, src/lib/supabase.js, src/pages/strefa/auth/callback.astro, src/pages/strefa/auth/reset.astro + NOWE pliki src/lib/strefa-ui.js i src/lib/strefa-grid.js.
NIE DOTYKAJ: src/lib/slajdy/* (inny agent w rundzie 2 pracuje na wewnętrznościach slajdów — Ty w strefa-slajdy.js zmieniasz WYŁĄCZNIE to, co wynika z ekstrakcji wspólnych helperów UI).

Zastosuj znaleziska z pliku ${S}/pkg-A-strefa-libs.json. Przeczytaj go w całości, a potem wszystkie pliki zakresu w całości. Kluczowe pułapki z weryfikacji (MUSISZ ich przestrzegać):
1. strefa-ui.js: toast/openModal/closeModal/confirmDialog/$/$$/esc. closeModal NIE przyjmuje callbacka (bywa rejestrowany jako click-listener — dostałby MouseEvent); zamiast tego setOnModalClose(fn) wywoływany na KAŻDEJ ścieżce zamknięcia (przycisk, scrim, Escape). W programisci: setOnModalClose(() => { openDevId = null; }) w init + lokalny wrapper toast z timeoutem 3600 (65 call sites bez zmian). openModal z parametrem drawer=false (programisci dokleja strefa-modal--drawer).
2. strefa-grid.js: fabryka createGridNav — getRecord dostaje <tr> (data-pid vs data-did!), instancja eksponuje getter editing (czytany przez strażniki pollingu) i reset() (wołane w renderAll). Różnice zachowań MUSZĄ zostać: szkolenia połyka Spację dla zwykłych kolumn i ma toggle obecności (Spacja/F2/Enter/znaki na col=attendance) oraz filtr e.target.closest('select,input,textarea') — programisci NIE ma tego filtra i Spacja wchodzi jako appendChar. Martwą opcję selectAll usuń.
3. Realtime: wspólny helper w supabase.js (subskrypcja kanału + debounce 400ms + setInterval 60s + visibilitychange + setAuth), parametryzowany listą tabel i callbackiem; w programisci dodatkowy triggerCatalog dla dev_skill_catalog musi dalej działać. Usuń shadowing const sb w startRealtime szkoleń.
4. Model etapów STAGES/STAGE_COLORS/stageColor/stageName + SUBS + wspólne wpisy ICO + fmtDate/fmtDateTime/todayStr/telHref — do strefa-ui.js (lub strefa-common — wybierz JEDEN nowy moduł zamiast dwóch, jeśli to czytelniejsze; grid osobno).
5. BUGFIX [idx 10]: selektor '#m-head' — prawidłowe id to 'mail-head' (klik „Edytuj szkic" rzuca dziś TypeError). Napraw.
6. Wydajność: exportJSON N+1 → jedno zapytanie .in('participant_id', ids) [idx 11]; toggle-disabled: sekwencyjne await w pętli → jedno zapytanie/Promise.all [idx 16].
7. Pozostałe drobne dead-code/simplification z pliku pakietu (idx 12,17,18,20,21,22).
8. waitForSession w supabase.js + użycie w callback.astro i auth/reset.astro [idx 56 — opis w ${S}/pkg-E-perf.json, wpis z idx 56].
Na końcu: node --check na wszystkich edytowanych/nowych .js.`, { label: 'apply:A-strefa-libs', phase: 'Runda 1', schema: REPORT, effort: 'max' }),

  // C — CSS
  () => agent(COMMON + `
ZAKRES PLIKÓW: src/styles/main.css, src/styles/strefa.css.
Zastosuj znaleziska z ${S}/pkg-C-css.json (martwe reguły + scalenia duplikatów). Zanim usuniesz JAKĄKOLWIEK klasę, samodzielnie zweryfikuj grep-em brak użyć w src/**/*.astro i src/lib/**/*.js — wliczając klasy budowane dynamicznie w template literals (np. 'strefa-btn--' + x, classList.add, stringi HTML w JS). Przy scalaniu bloków w listy selektorów sprawdź bezpieczeństwo kaskady: między pozycjami scalanych bloków nie może istnieć reguła o tej samej specyficzności celująca w te same elementy. W razie wątpliwości co do pojedynczej reguły — zostaw ją i odnotuj.`, { label: 'apply:C-css', phase: 'Runda 1', schema: REPORT }),

  // D — komponenty stron: przepis + konwersja wzorcowa, potem batche
  () => agent(COMMON + `
ZADANIE: ekstrakcja powtórzonych bloków markupu do komponentów Astro wg ${S}/pkg-D-pages.json (przeczytaj w całości).
ZAKRES: NOWE komponenty w src/components/ + konwersja WZORCOWA 3 stron: src/pages/index.astro, src/pages/metoda.astro, src/pages/gemini-cli.astro.
WYKLUCZONE pliki (inni agenci): src/pages/zapis.astro, src/pages/qr.astro, src/pages/strefa/**. Konwertuj tylko strony używające layoutów Base/Interior.
Komponenty (nazwy dobierz w stylu repo): CTA-band [idx 47], nagłówek sekcji eyebrow+h2 [idx 48], proof-strip [idx 49], FAQ details/summary [idx 50], przycisk z podwójną strzałką SVG [idx 51]. KRYTYCZNE: wygenerowany HTML musi być identyczny z obecnym (te same klasy, atrybuty, struktura — orkiestrator porówna zbudowany dist/ z baseline). Konwertuj TYLKO wystąpienia dokładnie pasujące do wzorca; każdy wariant (dodatkowe klasy/atrybuty/id) obsłuż propsami albo ZOSTAW nieskonwertowany. Numerację FAQ zrób propem/indeksem tak, by wynikowy HTML był identyczny.
Do index.astro dodatkowo: fetchpriority="high" na <img src="/img/hero-panel.webp"> (TYLKO ten atrybut) [idx 59 z pkg-E-perf.json].
Po konwersji 3 stron wzorcowych zbuduj listę POZOSTAŁYCH stron do konwersji (grep wzorców) i napisz KOMPLETNY przepis konwersji dla agentów batchowych (dokładne wzorce → mapowanie na komponenty z propsami, pułapki, warianty których NIE ruszać).`, { label: 'apply:D-recipe', phase: 'Runda 1', schema: RECIPE, effort: 'max' })
    .then(async (recipe) => {
      if (!recipe || !recipe.remainingFiles || !recipe.remainingFiles.length) return { recipe, batches: [] }
      const files = recipe.remainingFiles.filter((f) => !/zapis\.astro|qr\.astro|\/strefa\//.test(f))
      const size = 7
      const chunks = []
      for (let i = 0; i < files.length; i += size) chunks.push(files.slice(i, i + size))
      log(`D: przepis gotowy, ${files.length} stron w ${chunks.length} batchach`)
      const batches = await parallel(chunks.map((chunk, bi) => () =>
        agent(COMMON + `
ZADANIE: mechaniczna konwersja stron Astro na komponenty wg gotowego przepisu. Konwertujesz WYŁĄCZNIE te pliki (nie dotykaj żadnych innych):
${chunk.map((f) => '- ' + f).join('\n')}

PRZEPIS OD ARCHITEKTA (stosuj dokładnie):
${recipe.recipe}

KOMPONENTY:
${recipe.components.map((c) => c.path + ' — użycie: ' + c.usage).join('\n')}

KRYTYCZNE: wynikowy HTML po zbudowaniu musi być IDENTYCZNY. Konwertuj tylko dokładne dopasowania wzorca; warianty zostaw bez zmian i zgłoś w skipped. Nie zmieniaj treści.`, { label: `apply:D-batch${bi + 1}`, phase: 'Runda 1', schema: BATCH })))
      return { recipe, batches: batches.filter(Boolean) }
    }),
])

log('Runda 1 zakończona — startuje runda 2')
phase('Runda 2')

const round2 = await parallel([
  // B — wewnętrzności slajdów
  () => agent(COMMON + `
ZAKRES PLIKÓW: src/lib/strefa-slajdy.js, src/lib/slajdy/slide-editor.js, slide-model.js, slide-renderer.js, slide-store.js, src/pages/strefa/slajdy.astro.
UWAGA: strefa-slajdy.js został właśnie zrefaktorowany (wspólne helpery UI przeniesione do src/lib/strefa-ui.js) — przeczytaj AKTUALNY stan plików przed pracą i git diff HEAD dla kontekstu.
Zastosuj znaleziska z ${S}/pkg-B-slajdy.json (przeczytaj w całości; wpisy się częściowo pokrywają — 13≈33, 14≈30, 15≈35 — zastosuj raz). Obejmuje m.in.: scalenie 3× przepływu wstawiania slajdu, helper commit→renderEditor→reselect (7×), dedup esc/FONT_STACKS/ALIGN_JUSTIFY, marquee/drag-to-draw jako jedna maszyna rubber-band, martwy parametr editable renderera, insertText=insertTextAt(środek), PRESENTER_CSS vs EXPORT_SLIDE_CSS, martwe pola modelu (autoHeight/naturalW/naturalH — usuń zapisy, NIE dotykaj istniejących danych w DB), redundantne wywołania, ICO.undo/redo. Perf [36] renderStrip — zastosuj tylko jeśli jesteś PEWNY zachowania 1:1 (miniatury muszą się odświeżać dokładnie jak dziś), inaczej pomiń z notatką. [53] moveable → dynamiczny import (memoizowany loader) tak, by bundle strony ładował go leniwie; sprawdź wszystkie punkty użycia.
Na końcu node --check na wszystkich edytowanych .js.`, { label: 'apply:B-slajdy', phase: 'Runda 2', schema: REPORT, effort: 'max' }),

  // E — wydajność
  () => agent(COMMON + `
ZAKRES PLIKÓW: netlify.toml, src/layouts/Base.astro, src/layouts/Strefa.astro, src/pages/zapis.astro, src/pages/qr.astro, src/pages/strefa/login.astro, src/pages/strefa/reset.astro, src/pages/strefa/auth/reset.astro, src/lib/strefa-programisci.js, public/fonts/ (nowy), src/styles/ (nowe pliki), ewentualnie src/layouts/Bare.astro (nowy).
UWAGA: strefa-programisci.js zrefaktorowany w rundzie 1 — czytaj stan aktualny.
Zastosuj z ${S}/pkg-E-perf.json wpisy idx 52, 54, 55, 57, 58 (idx 56 i 59 już zrobione — pomiń):
- [52] netlify.toml: Cache-Control immutable dla /_astro/* (wzoruj się na istniejących regułach).
- [55] flatpickr → dynamiczny, zmemoizowany import w strefa-programisci.js (wraz z locale pl i dark.css) wg proposal; helpery stają się async — sprawdź WSZYSTKIE call sites i zachowaj kolejność efektów.
- [57] layout Bare.astro dla samodzielnych stron wg proposal (propsy: title, viewport, slot head), użyj we wskazanych stronach.
- [54] src/styles/strefa-core.css dla /zapis i /qr wg proposal; ZANIM podepniesz, wypisz wszystkie klasy używane w markupie i JS-owych template strings tych dwóch stron i upewnij się, że każda ma reguły w core (brakujące dołącz). Strony mają wyglądać IDENTYCZNIE.
- [58] self-host fontów Google: sprawdź w layoutach jakie rodziny/wagi/style są ładowane; pobierz css2 z nagłówkiem UA nowoczesnej przeglądarki, wyciągnij @font-face z unicode-range (KONIECZNIE subsety latin ORAZ latin-ext — polskie znaki!), pobierz pliki woff2 do public/fonts/, stwórz src/styles/fonts.css z font-display:swap, podmień we wszystkich 7 plikach preconnect+stylesheet na lokalne. Zweryfikuj, że nazwy font-family są bajt-w-bajt zgodne z tym, czego używa CSS (var --font-*). Jeśli czegokolwiek nie da się odtworzyć 1:1 — NIE wdrażaj tej części, zostaw Google Fonts i odnotuj.
Na końcu node --check na edytowanych .js.`, { label: 'apply:E-perf', phase: 'Runda 2', schema: REPORT, effort: 'max' }),
])

return {
  A: round1[0], C: round1[1],
  D: round1[2] ? { recipe: { components: round1[2].recipe?.components, convertedFiles: round1[2].recipe?.convertedFiles }, batches: round1[2].batches } : null,
  B: round2[0], E: round2[1],
}