# SZRON Web — konwencje budowania (v2 „Szron", 09.2026)

Design system strony szron.tech (Astro → React wrappery). **Nie ma providera** — komponenty działają bez wrappera. Stylowanie w całości przez **klasy CSS z `styles.css` + tokeny `var(--*)`**; komponenty nie przyjmują propsów stylujących.

## Motyw

**Cała strona jest ciemna.** Grunt `--color-ink` (granatowa czerń), karty `--color-ink-2`, akcent **lodowy cyjan** `--color-accent`, poświaty brand-blue (`--color-brand-glow`). Pomarańcz i jasne tło z v1 nie istnieją — nie wracaj do nich. `--color-paper`/`--color-text` to aliasy ciemnych tokenów (jasne nadpisuje tylko zamknięta strefa).

## Szkielet strony

Każda sekcja: `<section class="sect">` (grunt) lub `<section class="sect sect--dark">` (pas z granatową poświatą i hairline'ami) z `<div class="container">` w środku. Nie ustawiaj tła ręcznie. Strona zaczyna się od `<Nav />` (logo + pigułka linków + biały CTA) na hero i kończy `<CtaBand />` + `<Footer />` (LED-index + obrys wordmarka).

## Słownik klas (z main.css — używaj tych, nie wymyślaj własnych)

- Sekcje/layout: `sect`, `sect--dark`, `container`, `sect-head`, `sect-title`, `sect-title--s`, `sect-lead`
- Typografia: `eyebrow` (LED Doto w ramce, uppercase, cyjan), `ws` (nagłówek scramble), `hero__lead`, `sect-lead`
- Przyciski: `btn`, `btn--accent` (cyjan → biały na hover; jedyny CTA), `btn--ghost` / `btn--dark` / `btn--dark-on-light` (na ciemnej stronie to ten sam „szklany" obrys), `btn__arr` (podwójna strzałka — używaj komponentu `BtnArrow`, nie ręcznie)
- Karty/listy: `grid-cards`, `card-tile`, `link-cards`, `link-cards--num`, `link-card`, `case-card`, `badge`, `badge--new`, `callout`, `proof-strip`, `proof-band`, `faq`, `faq-cta`
- Hero: `hero`, `hero__grid`, `hero__inner`, `hero__title`, `hero__lead`, `hero__cta`, `hero__aside`, `hero__panel`, `hero__panel-led` (migająca dioda + LED-etykieta), `hero__panel-num` (liczba Doto z poświatą), `hero__panel-cap`, `hero__proof`, `hero__tag`, `hero-img`
- Nawigacja/stopka: `nav`, `nav__inner`, `nav__links`, `nav__menu`, `nav__burger`, `logo`, `footer`, `footer__grid`, `footer__col`, `footer__tagline`, `footer__legal`, `footer__mark`
- Obrazy: `ph` (placeholder/zdjęcie z lodowym duotonem — NIE dla zdjęć ludzi), `shot-grid`, `shot`, `shot-btn`
- Animacje tekstu (reveal + scramble w kolorze akcentu) działają AUTOMATYCZNIE: runtime w bundle taguje nagłówki, akapity, listy, przyciski i linki (poza nawigacją) i animuje je przy wejściu na viewport, z replay. Możesz dodać `rv` własnym blokom i opóźnienie kaskady: `style={{ '--rv-d': '0.12s' }}`. Bez JS treść jest po prostu widoczna.

## Tokeny (tokens.css — pełna lista w styles.css)

- Kolory: `--color-ink-0/ink/ink-2/ink-3` (grunt → karty → hover), `--color-snow` (jasna powierzchnia odwrócona), `--color-line`, `--color-line-strong`, `--color-text`, `--color-text-2`, `--color-text-3`, `--color-accent` (cyjan oklch 82% 0.115 210), `--color-accent-2`, `--color-accent-soft`, `--color-accent-glow`, `--color-brand-glow`, `--color-brand-soft`, `--color-glass`, `--color-brand` (#3c56f4 — TYLKO nawiasy logo)
- Typografia: `--font-display` (Space Grotesk 400 — nagłówki), `--font-body` (Albert Sans), `--font-led` (Doto — eyebrow, liczby, indeks stopki); skala: `--text-display`, `--text-h2`, `--text-h2-s`, `--text-h3`, `--text-h4`, `--text-lead`, `--text-l`, `--text-body`, `--text-s`, `--text-caption`, `--text-led`, `--text-stat`, `--text-mark`
- Odstępy (4pt): `--space-2xs` … `--space-3xl`, `--space-4xl`, `--space-sect`; promienie: `--radius-btn`, `--radius-sm`, `--radius-card`, `--radius-sect`; cienie: `--shadow-card`, `--shadow-pop`

## Gdzie leży prawda

Przed stylowaniem przeczytaj `styles.css` (i jego closure — tokeny, fonty, cały main.css strony). Per-komponent: `components/general/<Name>/<Name>.prompt.md` i `.d.ts`.

## Przykład idiomatyczny

```jsx
import { SectHead, BtnArrow, ProofStrip } from 'szron-ds';

<section className="sect">
  <div className="container">
    <SectHead eyebrow="03 / Metoda" title="Dwa kwartały na Waszym kodzie">
      <p className="sect-lead">Pomiar efektu — liczby zamiast wrażeń.</p>
    </SectHead>
    <ProofStrip wrap={false} items={[['15+ lat', 'doświadczenia'], ['2 kwartały', 'na wdrożenie']]} />
    <div style={{ marginTop: 'var(--space-xl)' }}>
      <BtnArrow href="/umow-rozmowe">Umów rozmowę</BtnArrow>
    </div>
  </div>
</section>
```

Uwagi: `Nav` i `Footer` używają `logo-dark.svg` (biały napis) — strona nie ma jasnych sekcji. Poniżej 64rem szerokości `nav__links` znika (breakpoint mobilny). `Faq` numeruje się samo; odpowiedzi mogą nieść HTML.
