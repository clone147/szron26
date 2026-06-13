# Konwencje budowy stron — SZRON (Astro)

Czytasz to jako subagent budujący JEDNĄ podstronę `.astro`. Trzymaj się ściśle poniższego — strony mają wyglądać jak jedna spójna witryna.

## Zasady nadrzędne
- **Język: polski, z pełnymi znakami diakrytycznymi** (ą ć ę ł ń ó ś ż ź). Cudzysłowy „polskie".
- **Nie wymyślaj metryk/liczb.** Używaj wyłącznie danych z materiału źródłowego. Jeśli źródło nie podaje liczby — nie podawaj jej.
- **Treść:** priorytet ma `teksty-strony-nowe.md` (jeśli wskazany zakres linii). W przeciwnym razie wyciągnij realną treść z pliku `.tsx` ze starej strony (`../../szron.tech/src/pages/X.tsx`) — bierz teksty/nagłówki/listy, ignoruj logikę React, importy, motion. Przeredaguj w nasz układ; NIE kopiuj struktury JSX.
- **Ścieżki assetów: absolutne** (`/img/...`, `/js/...`). Obrazów z grafik nie wymyślaj — jeśli strona potrzebuje grafiki, użyj placeholdera `.ph` (patrz niżej) z opisową etykietą, albo pomiń.
- **Brak `{` `}` w treści tekstowej** (Astro traktuje je jako wyrażenia). Jeśli musisz, użyj encji.
- Plik zaczyna się od frontmatter `---` z importem layoutu. Bez `<html>/<head>` — to daje layout.

## Layout: `Interior.astro`
Każda strona (poza homepage) używa:
```astro
---
import Interior from '../layouts/Interior.astro';
---
<Interior
  title="Tytuł SEO — SZRON"        {/* <title> + og:title */}
  description="Opis SEO 140–160 zn."
  eyebrow="01 / Sekcja · Podtytuł"  {/* mały tag nad H1, opcjonalny */}
  heading="Nagłówek H1 strony"
  lead="Akapit wprowadzający pod H1."
  headingSmall={false}              {/* true dla długich H1 */}
>
  {/* tu sekcje */}
</Interior>
```
Layout sam daje: nav (z dropdownem Akademia), ciemny baner nagłówka (eyebrow/H1/lead), białą „kartkę" z sekcjami, stopkę. Ty dostarczasz tylko `<section>`-y do slotu.

## Rytm strony (wzór: `src/pages/doradztwo-technologiczne.astro`)
Sekcje na przemian jasne/ciemne. Wzorzec:
1. (opc.) `proof-strip` — 3 krótkie dowody tuż pod banerem
2. kilka sekcji treści `.sect` (co druga `.sect--dark`)
3. końcowy ciemny baner CTA (`.sect--dark.cta-band`) z przyciskiem do `/umow-rozmowe`

## Słownik klas (wszystkie już istnieją w `src/styles/main.css`)
- **Sekcja:** `<section class="sect">` (jasna) lub `<section class="sect sect--dark">` (ciemna). `style="padding-top:0"` by skleić z poprzednią.
- **Kontener:** `<div class="container">` — ZAWSZE wewnątrz sekcji.
- **Nagłówek sekcji:**
  ```html
  <div class="sect-head">
    <p class="eyebrow rv" data-scramble>02 / Zakres · Co dostajecie</p>
    <h2 class="sect-title ws">Tytuł sekcji.</h2>  {/* sect-title--s = mniejszy */}
  </div>
  ```
- **Karty (responsywna siatka):** `<div class="grid-cards">` z `<article class="card-tile">` → `<p class="eyebrow">01 / X</p><h3>…</h3><p>…</p>`. Działa też w `.sect--dark`.
- **Lista „etykieta → opis":** `<dl class="def-rows"><div><dt>Nazwa<small>tagline</small></dt><dd>opis</dd></div>…</dl>`
- **Tabela porównawcza/wyników:** `<table class="results-table"><thead>…<tbody>` (ostatnia kolumna `<strong>` = akcent).
- **Kroki procesu:** `<div class="steps"><article class="step"><p class="eyebrow">01 · Tydzień 1</p><h3>…</h3><p>…</p></article>…</div>` + opc. `<div class="proof-strip">`.
- **Pasek dowodów/termów:** `<div class="proof-strip"><div><strong>Duże</strong><span>opis</span></div>…</div>` (3 kolumny).
- **FAQ:** `<div class="faq"><details><summary><span class="num">01</span> Pytanie? <span class="ico" aria-hidden="true">+</span></summary><p>Odpowiedź.</p></details>…</div>`
- **Cytat/opinia:** `<figure class="quote-card"><blockquote>„…"</blockquote><figcaption><strong>Imię</strong> — rola</figcaption></figure>`
- **Zespół (osoby):** `<article class="person"><div class="person__head"><span class="person__avatar">TW</span><div><h3>Imię</h3><p class="person__role">rola</p></div></div><p>bio</p></article>` w `<div class="team">`.
- **Treść długa/techniczna (Akademia, prawne, blog):** `<div class="prose">` z `<h2>/<h3>/<p>/<ul>/<ol>/<pre><code>/<table>/<blockquote>`. Do wyróżnień: `<div class="callout"><p><strong>Aktualizacja:</strong> …</p></div>`.
- **Spis linków (np. powiązane szkolenia):** `<div class="link-cards"><a class="link-card" href="/x"><h3>Tytuł</h3><p>opis</p></a>…</div>`
- **Placeholder grafiki:** `<figure class="ph" style="--ph-ar: 16/9"><figcaption class="ph__label">opis grafiki</figcaption></figure>` (lub `.ph--dark` na ciemnym tle).
- **Przyciski:** `<a class="btn btn--accent" href="…">Tekst</a>` (pomarańczowy), `btn--ghost` (obrys, na ciemnym), `btn--dark` (na jasnym). Strzałkę dodawaj tak:
  ```html
  <a class="btn btn--accent" href="/umow-rozmowe">Umów rozmowę
    <span class="btn__arr" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" stroke-width="1.8"/></svg>
      <svg viewBox="0 0 16 16" fill="none"><path d="M2 8h11M9 3.5 13.5 8 9 12.5" stroke="currentColor" stroke-width="1.8"/></svg>
    </span>
  </a>
  ```
- **CTA końcowe:** `<section class="sect sect--dark cta-band"><div class="container"><p class="eyebrow" data-scramble>Kontakt</p><h2>…</h2><p>…</p><div class="contact__cta"><a class="btn btn--accent" href="/umow-rozmowe">Zarezerwuj termin …</a><a class="btn btn--ghost" href="tel:+48505091200">+48 505 091 200</a></div></div></section>`

## Animacje (klasy)
- Na elementy wjeżdżające przy scrollu dodaj `rv` (fade-up). Opóźnienie: `style="--rv-d:.1s"`.
- Na nagłówki (h1/h2) dodaj `ws` (reveal słowo-po-słowie). H1 w banerze ma `ws` automatycznie? NIE — w slocie dodaj sam.
- Na eyebrow dodaj `data-scramble` (efekt scramble).
- JS (`/js/main.js`) sam to obsłuży. Nie pisz własnego JS.

## CTA / kontakt
- Główny CTA zawsze → `/umow-rozmowe`. Telefon: `+48 505 091 200`. Mail: `tw@szron.tech`.

## Czego NIE robić
- Nie twórz `<style>` z nowymi kolorami/fontami — używaj istniejących klas i tokenów (`var(--color-*)`, `var(--space-*)`).
- Nie dodawaj nav ani stopki (są w layoucie).
- Nie używaj React/wysp, chyba że zadanie wyraźnie tego wymaga (narzędzia interaktywne).
- Nie wstawiaj prawdziwych zdjęć/URLi, których nie ma w `public/img/`.

## Wynik
Zwróć WYŁĄCZNIE kompletną zawartość pliku `.astro` (od `---`), gotową do zapisu. Bez komentarzy poza plikiem.
