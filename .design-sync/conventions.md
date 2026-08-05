# SZRON Web — konwencje budowania

Design system strony szron.tech (Astro → React wrappery). **Nie ma providera** — komponenty działają bez wrappera. Stylowanie w całości przez **klasy CSS z `styles.css` + tokeny `var(--*)`**; komponenty nie przyjmują propsów stylujących.

## Szkielet strony

Każda sekcja: `<section class="sect">` (jasna) lub `<section class="sect sect--dark">` (ciemna, atrament) z `<div class="container">` w środku. Tło strony to `--color-paper` (biel), sekcje ciemne mają własny kolor — nie ustawiaj tła ręcznie. Strona zwykle zaczyna się od `<Nav />` na ciemnym hero i kończy `<CtaBand />` + `<Footer />`.

## Słownik klas (z main.css — używaj tych, nie wymyślaj własnych)

- Sekcje/layout: `sect`, `sect--dark`, `container`, `sect-head`, `sect-title`, `sect-title--s`, `sect-lead`
- Typografia: `eyebrow` (uppercase label nad nagłówkiem), `ws` (nagłówek scramble), `hero__lead`, `sect-lead`
- Przyciski: `btn`, `btn--accent` (pomarańcz CTA), `btn--ghost` (obrys, na ciemnym), `btn--dark`, `btn__arr` (podwójna strzałka — używaj komponentu `BtnArrow`, nie ręcznie)
- Karty/listy: `grid-cards`, `card-tile`, `link-cards`, `link-card`, `case-card`, `badge`, `callout`, `proof-strip`, `faq`, `num`, `ico`
- Hero: `hero`, `hero__grid`, `hero__title`, `hero__lead`, `hero__cta`, `hero__panel`, `hero__proof`
- Nawigacja/stopka: `nav`, `nav__inner`, `nav__links`, `logo`, `footer`, `footer__grid`, `footer__col`, `footer__legal`, `footer__mark`
- Galerie: `shot-grid`, `shot`, `shot-btn`
- Animacje tekstu (reveal + scramble: dekodowanie z losowych symboli w kolorze akcentu, styl monako.ai) działają AUTOMATYCZNIE: runtime w bundle sam taguje wszystkie nagłówki, akapity i elementy list (poza nawigacją) i animuje je przy wejściu na viewport, z replay po ponownym wejściu. Nie musisz nic dodawać; możesz dodać `rv` niestandardowym blokom (np. karcie-divowi) i opóźnienie kaskady per element: `style={{ '--rv-d': '0.12s' }}`. Bez JS treść jest po prostu widoczna.

## Tokeny (tokens.css — pełna lista w styles.css)

- Kolory: `--color-ink`, `--color-ink-2`, `--color-paper`, `--color-paper-2`, `--color-line`, `--color-line-dark`, `--color-text`, `--color-text-2`, `--color-text-inv`, `--color-text-inv-2`, `--color-accent` (pomarańcz oklch 70.5% 0.187 45), `--color-accent-soft`, `--color-brand` (#3c56f4 — TYLKO brackety logo)
- Typografia: `--font-display` (Space Grotesk — nagłówki), `--font-body` (Albert Sans); skala: `--text-display`, `--text-h2`, `--text-h3`, `--text-h4`, `--text-lead`, `--text-body`, `--text-s`, `--text-caption`, `--text-stat`, `--text-mark`
- Odstępy (skala 4pt): `--space-2xs` … `--space-3xl`; promienie: `--radius-btn`, `--radius-card`

## Gdzie leży prawda

Przed stylowaniem przeczytaj `styles.css` (i jego closure — tokeny, fonty, cały main.css strony). Per-komponent: `components/general/<Name>/<Name>.prompt.md` i `.d.ts`.

## Przykład idiomatyczny

```jsx
import { SectHead, BtnArrow, ProofStrip } from 'szron-ds';

<section className="sect">
  <div className="container">
    <SectHead eyebrow="Metoda" title="Dwa kwartały na Waszym kodzie">
      <p className="sect-lead">Pomiar efektu w DEVLens — liczby zamiast wrażeń.</p>
    </SectHead>
    <ProofStrip wrap={false} items={[['15+ lat', 'doświadczenia'], ['2 kwartały', 'na wdrożenie']]} />
    <div style={{ marginTop: 'var(--space-xl)' }}>
      <BtnArrow href="/umow-rozmowe">Umów rozmowę</BtnArrow>
    </div>
  </div>
</section>
```

Uwagi: `Nav` renderuj na ciemnym tle (`--color-ink`) — logo-dark ma biały napis. Poniżej 64rem szerokości `nav__links` znika (breakpoint mobilny). `Faq` numeruje się samo; odpowiedzi mogą nieść HTML.
