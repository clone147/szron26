# Prompty do generowania obrazów — strona główna SZRON

Spójny system wizualny dla wszystkich grafik: **„szron + żar"** — ciemny grafit `#080d10`,
motyw szronu/lodu (brand!), jeden ciepły pomarańczowy akcent `#ff7a00`, premium fotografia
tech-editorial, bez tekstu i logotypów na obrazach.

Zasady:
- Generuj w podanych proporcjach (`--ar`), potem skaluj/przycinaj do podanych pikseli.
- Zapisuj jako **WebP** pod dokładną nazwą pliku do katalogu `img/` — placeholdery na stronie
  podmienią się automatycznie (etykieta znika, obraz wchodzi pod warstwę tekstu).
- Negative prompt wszędzie: `text, letters, watermark, logo, UI screenshots, readable screens, people faces`.
- Przy wdrożeniu na domenę zmień `og:image` w `index.html` na pełny URL.

---

## 1. `img/og-cover.webp` · 1200×630 (`--ar 1.91:1`) — podgląd przy udostępnianiu (OG)

> Wide brand cover image: macro hoarfrost ice crystals growing across dark tempered glass,
> faint circuit-board traces glowing warm orange beneath the frost, deep charcoal background
> (#080d10), single warm orange light source (#ff7a00), premium tech-editorial macro
> photography, sharp crystal detail, large empty dark negative space on the left for a
> headline, no text, no logos, no people.

## 2. `img/hero-panel.webp` · 1600×1200 (`--ar 4:3`) — panel w hero (pod napisem „2–4×")

> Macro photograph of hoarfrost crystals spreading over a dark glass surface with subtle
> glowing orange circuit traces underneath the ice, deep charcoal palette (#080d10) with a
> single warm orange accent (#ff7a00), premium tech-editorial photography, composition
> weighted to the top-right corner, lower-left area dark and empty (text overlay space),
> shallow depth of field, no text, no logos, no people.

## 3. `img/problem-a.webp` · 960×720 (`--ar 4:3`) — „Konkurencja wypuszcza szybciej"

> Long-exposure orange light trails streaking past a static, frost-covered server cabinet
> at night, sense of speed rushing past something frozen in place, dark charcoal scene
> (#080d10), warm orange motion blur (#ff7a00), cinematic tech-editorial photography,
> no text, no logos, no people.

## 4. `img/problem-b.webp` · 960×720 (`--ar 4:3`) — „Klasyczne odpowiedzi nie skalują się"

> A vast dark archive hall of identical frosted-glass server cabinets receding into
> darkness, endless repetition, one single cabinet glowing faint warm orange in the
> distance, deep charcoal palette (#080d10), moody volumetric light, premium
> tech-editorial photography, no text, no logos, no people.

## 5. `img/problem-c.webp` · 960×720 (`--ar 4:3`) — „AI obiecuje rozwiązanie"

> A single bright warm orange spark of light (#ff7a00) trapped inside a thick block of
> clear ice on a dark charcoal background (#080d10), potential frozen in place, macro
> studio photography, dramatic side light, high detail of ice texture, no text, no logos,
> no people.

## 6. `img/path-01.webp` · 1280×720 (`--ar 16:9`) — Ścieżka 01: Trening z AI

> Overhead shot of a workshop table in a dark room: several laptops, handwritten
> architecture diagrams on paper, hands of developers pointing at a screen, warm orange
> desk lamp light (#ff7a00) against deep charcoal shadows (#080d10), documentary editorial
> photography, no visible faces, screens out of focus, no readable text, no logos.

## 7. `img/path-02.webp` · 1280×720 (`--ar 16:9`) — Ścieżka 02: Agentowe programowanie

> Threads of glowing warm orange light (#ff7a00) weaving precisely through a dark
> crystalline lattice structure covered in light frost, like an intelligent agent
> navigating a complex system, deep charcoal background (#080d10), abstract 3D render,
> premium tech aesthetic, sharp detail, no text, no logos, no people.

## 8. `img/path-03.webp` · 1280×720 (`--ar 16:9`) — Ścieżka 03: Pilot modernizacji

> An old weathered industrial brick machine hall seamlessly merging into a sleek modern
> glass-and-steel extension, dusk, interior glowing warm orange (#ff7a00), frost on the
> old windows, dark moody sky in charcoal tones (#080d10), architectural photography,
> wide shot, no text, no logos, no people.

## 9. `img/case-regiobus.webp` · 1280×720 (`--ar 16:9`) — Case study: RegioBus Systems

> A modern city bus passing a frosted-glass bus shelter at night, slight motion blur on
> the bus, warm orange interior and validator lights glowing (#ff7a00), screens out of
> focus and unreadable, dark charcoal urban scene (#080d10), cinematic editorial
> photography, light hoarfrost on the shelter glass, no text, no logos, no readable
> displays, no recognizable faces.

---

## 10–11. `img/team-tomek.webp` i `img/team-maciej.webp` · 800×800 (kwadrat)

**Nie generować AI.** To prawdziwe osoby — użyjcie prawdziwych zdjęć portretowych
(kadr na twarz, możliwie ciemne/neutralne tło, dobre światło). Placeholder pokazuje
inicjały, dopóki plik nie istnieje. AI można użyć co najwyżej do retuszu/podmiany tła
własnego zdjęcia na ciemny grafit.

---

### Po wygenerowaniu

```bash
# konwersja do webp (np. przez cwebp albo sips na macOS):
cwebp -q 82 wejscie.png -o img/hero-panel.webp
```

Pliki wrzucone do `img/` pod powyższymi nazwami pojawią się na stronie bez zmian w kodzie.
