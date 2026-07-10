# Notatki design-sync (Szron.new → „SZRON Web (szron.tech) DS")

- Repo to strona Astro (SSG), bez Reacta — DS zbudowany off-script: pakiet `ds/` z cienkimi
  wrapperami React 1:1 na klasach z `src/styles/main.css`. Markup wrapperów przeniesiony z
  `src/components/*.astro`; **przy zmianie .astro trzeba ręcznie zsynchronizować odpowiedni
  `ds/src/*.tsx`** — nic tego nie pilnuje automatycznie.
- Build: `npm run build --prefix ds` = `tsc` (dist/ + .d.ts) + `node build-css.mjs`
  (skleja tokens.css + fonts.css + main.css + ds/styles/components.css w płaski
  `ds/styles/compiled.css`; cssEntry NIE może mieć @import — treść idzie verbatim do _ds_bundle.css).
  Konwerter: `--entry ds/dist/index.js --node-modules ds/node_modules`
  (w ds/node_modules jest self-symlink `szron-ds -> ../..` — odtworzyć po świeżym clone).
- Fonty: build-css kopiuje woff2 z `public/fonts` do `ds/styles/fonts/` (gitignored) i przepisuje
  `url(/fonts/…)` → `./fonts/…` — pliki spoza `ds/` nie przechodzą przez bound cssEntry.
- Animacje tekstu: runtime `ds/src/reveal.ts` = wierny port public/js/main.js (auto-tagowanie
  wszystkich tekstowych liści rv+data-scramble poza <nav>, IO z replay, scramble z blokadą
  wysokości, identyczne SETS/KEEP). Startuje od załadowania jak na stronie; wyłącza się przy
  `navigator.webdriver` (headless capture) i prefers-reduced-motion — wtedy CSS
  `html:not(.rv-armed) .rv` trzyma treść widoczną, stąd stabilny render check.
  Po zmianie main.js zsynchronizować port.
- Nav: wariant statyczny — pominięte dropdowny Oferta/Akademia, panel logowania Strefy i
  `.nav__tel` (scoped CSS + JS w Nav.astro). Podgląd wymaga ciemnego tła (logo-dark = biały napis)
  i viewportu ≥64rem (breakpoint chowa `.nav__links`); override w config: single/1280x220.
- ShotGallery: lightbox pominięty (skrypt runtime); CSS scoped przeniesiony verbatim do
  `ds/styles/components.css`. Placeholder screenshotów w podglądzie to inline SVG data-URI.
- Loga w podglądach Nav/Footer: base64 data-URI z `public/img/logo{,-dark}.svg` — po zmianie
  logo odświeżyć `.design-sync/previews/{Nav,Footer}.tsx`.
- `strefa*.css` celowo poza DS (zamknięta strefa ≠ publiczny design system).

## Known render warns
- (brak — 8/8 czysto, po neutralizacji .rv i poprawce viewportu Nav)

## Re-sync risks
- **Dryf wrapperów**: `ds/src/*.tsx` to ręczna kopia markupu `.astro` — po każdej zmianie
  komponentów strony porównać i zaktualizować, inaczej DS rozjedzie się ze stroną.
- Copy w podglądach (FAQ, CTA, ProofStrip) i base64 logotypów są zamrożone w
  `.design-sync/previews/` — stale, jeśli strona zmieni treści/branding.
- Klasy wymienione w `conventions.md` zweryfikowane wobec builda 2026-07-10 — po większych
  zmianach main.css powtórzyć walidację nazw (krok conventions w base skill).
- Toolchain: node 25, tsc z ds/devDependencies, playwright chromium-headless-shell v1228
  w ~/Library/Caches/ms-playwright.
