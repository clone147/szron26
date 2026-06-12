# Spec: Przeróbka tekstów szron.tech pod ofertę dla dużych firm

Data: 2026-06-12
Status: zatwierdzony ustnie, do review po spisaniu
Plik docelowy: `teksty-strony-nowe.md` (jedyny artefakt — bez HTML, bez nowych podstron)

## Kontekst

Obecna strona szron.tech pozycjonuje SZRON jako "AI Coach dla Dev Teamów". Plik
`teksty-strony-nowe.md` zawiera teksty nowej strony (7 podstron), napisane wokół
obietnicy "zmodernizujemy Waszą aplikację w kwartał". Zespół to dwie osoby:
Tomek Wojciechowski (AI workflow, strategia) i Maciej Stopa (backend, frontend,
mobile, Qt/QML).

Problem: właściciela interesują wyłącznie duże firmy, a obecne teksty
(widełki formularza od 3 osób, obietnica modernizacji całej aplikacji we dwóch,
case'y 3–4-osobowych zespołów bez ramki) celują szeroko i przy kliencie
enterprise tracą wiarygodność.

## Decyzje (zatwierdzone w brainstormingu)

1. **Target:** firmy z zespołem IT 30+ osób.
2. **Produkt flagowy:** transformacja zespołu IT (trening AI + programowanie
   agentowe), z pilotem modernizacji jednego modułu/aplikacji jako dowodem.
   Modernizacja całych systemów przestaje być obietnicą główną.
3. **Hero:** "Wasz zespół IT. 2–4 razy szybszy. W jeden kwartał." + podtytuł:
   wdrażamy programowanie agentowe na Waszym kodzie, nie na slajdach; dowodem
   pilot modernizacji w tym samym kwartale.
4. **Oferta dwuproduktowa:** kwartał transformacji (wejście) + stałe doradztwo
   zarządu (kontynuacja). Bez trzeciego poziomu, bez nowych podstron.
5. **Case studies przeramowane jako piloty.** Metryka RegioBus "4 osoby →
   1 osoba" zastąpiona przez "3 z 4 programistów uwolnionych do nowych
   projektów · 0 odejść z firmy".
6. **Filtr małych firm:** widełki formularza od 30+ oraz jawny komunikat
   kwalifikacji ("Pracujemy z firmami, których zespół IT liczy 30+ osób").
   Bez sygnału cenowego.
7. **Branże:** wszystkie obecne zostają, pogrupowane w 4 segmenty:
   przemysł i energetyka · transport i płatności · sektor regulowany ·
   software house / telco / R&D.

## Architektura treści strony głównej (index.html)

Kolejność sekcji po przeróbce:

1. **Hero** — nagłówek j.w., CTA "Umów 30-minutową rozmowę", komunikat
   kwalifikacji pod CTA. Liczby: 40+ lat (Tomek 25 · Maciej 18), 3 lata
   z LLM w produkcji, 2 osoby na każdym projekcie, 0 podwykonawców.
2. **Problem zarządu** — przepisany z perspektywy tempa zespołu: konkurencja
   przyspiesza, legacy spowalnia, klasyczne odpowiedzi (rekrutacja,
   outsourcing, rewrite) nie skalują się przy 30+ osobach. Modernizacja jako
   podpunkt, nie temat główny. Branże w 4 segmentach.
3. **Dlaczego teraz** — bez zmian merytorycznych (cytat Comarch, 20×,
   horyzont 6–12 mc, akapit o programowaniu intencyjnym).
4. **Metoda — trzy ścieżki** — nowa hierarchia: ścieżka 1 Trening z AI
   i ścieżka 2 Agentowe programowanie jako rdzeń flagowca; ścieżka 3
   **Pilot modernizacji** — jeden moduł/aplikacja do nowoczesnego stosu jako
   dowód metody, z opcją kontynuacji po kwartale. Pod ścieżką 3 w skróconej
   formie tabela zakresu (platforma / mobile / architektura / dane
   i integracje) + "Czego nie obiecujemy" + nota NDA. Obecna osobna sekcja
   "Modernizacja — co dokładnie robimy" znika jako samodzielny temat.
5. **Co robimy inaczej** — skorygowane: "szkolenie bez wdrożenia to za mało"
   (zamiast "nowa aplikacja to za mało"). Dwa akapity, bez tabeli.
6. **Korzyści (3)** — tempo zespołu · retencja ludzi i atrakcyjność
   pracodawcy · niższy koszt rozwoju (pilot modernizacji jako mnożnik).
7. **Case RegioBus + tabela wyników (3 wiersze)** — z ramką "skala pilota —
   to samo robimy z jednym zespołem w Waszej organizacji" i nowymi metrykami
   zespołowymi.
8. **Proces — 4 kroki** — tygodnie bez zmian; tygodnie 3–10 opisane jako
   "dwie ścieżki treningowe + pilot". Blok "A po kwartale?" → Doradztwo.
9. **Zespół (2 osoby)** — bez zmian merytorycznych.
10. **FAQ (7)** — dochodzi: "Czy to działa przy zespole 50+ osób?"
    (odpowiedź: fala po fali — start od jednego zespołu, wzorce skalują się
    przez CLAUDE.md i wewnętrznych championów). Pytanie o ciągłość działania
    starej aplikacji zostaje w FAQ, skrócone i odnoszące się do pilota.
    Reszta bez zmian (bezpieczeństwo, opór zespołu, pomiar, cena,
    kto pracuje). Razem 7 pytań.
11. **Kontakt** — narracja flagowca + komunikat kwalifikacji; format,
    wycena 48h, odpowiedzialność dwóch osób — bez zmian.

## Pozostałe podstrony

**Zespół** — bez zmian strukturalnych; język dopasowany do flagowca
("prowadzimy transformacje zespołów IT"). Hero: "Dwójka, która prowadzi każdą
transformację SZRON…".

**Case studies (lista + 3 case'y)** — lead listy: "Trzy piloty w trzech
branżach. Każdy prowadzony tak, jak pierwszy kwartał u Was: zespół klienta +
nasza dwójka."
- RegioBus: nowa metryka zespołowa w karcie, hero case'u i tabelach.
- STM32 i HMI: dopisek w leadzie o skali pilota ("przy 30+ pracujemy falami,
  zespół po zespole").

**Doradztwo** — start opisany jako kontynuacja kwartału transformacji;
odwołania do "modernizacji w kwartał" zamienione na "kwartał transformacji".
Reszta bez zmian.

**Umów rozmowę** —
- widełki zespołu IT: 30–100 · 100–300 · 300+;
- komunikat kwalifikacji nad formularzem (z furtką: "jeśli Wasz zespół jest
  mniejszy — napiszcie, ale program projektujemy pod duże organizacje");
- pole opisowe: "zespół i aplikacja: ile osób, jaki stos, co Was spowalnia";
- FAQ bez zmian poza językiem.

**Nawigacja/footer** — opis firmy: "Transformacja zespołów IT i programowanie
agentowe dla dużych firm". Etykiety nawigacji bez zmian.

## Język i ton

- Zostaje obecny: konkrety, liczby, polska powściągliwość, zgodność
  z checklistą humanizer-pl (rytm zdań, zero słownictwa AI).
- Słownik: "transformacja zespołu IT" / "kwartał transformacji" (produkt),
  "pilot modernizacji" (dowód). "Modernizacja" tylko jako nazwa ścieżki 3
  i temat case'ów.
- Sygnały enterprise (NIS2, PCI-DSS, RODO, AI on-premise, audit log, NDA)
  zostają tam, gdzie są — bez rozbudowy.

## Zakres implementacji

Wyłącznie edycja `teksty-strony-nowe.md`:
- hero + 3 sekcje index przepisane od nowa (problem, metoda-lead, korzyści),
- ~10 sekcji skorygowanych językowo,
- ~15 punktowych zamian (metryki RegioBus ×3 miejsca, widełki formularza,
  komunikaty kwalifikacji ×2, footer ×7 podstron, leady case'ów ×3, FAQ).

Poza zakresem: HTML/CSS, struktura plików strony, SEO techniczne, nowe
podstrony, cennik.

## Kryteria sukcesu

1. Czytelnik po hero wie: produkt = szybszy zespół, dowód = pilot,
   target = IT 30+.
2. Żadna sekcja nie obiecuje "zmodernizujemy cały Wasz system w kwartał".
3. Metryki zespołowe w case'ach nie sugerują redukcji etatów.
4. Mała firma (IT < 30) po lekturze hero + formularza wie, że to nie dla niej.
5. Teksty przechodzą checklistę humanizer-pl (rytm, konkrety, brak
   słownictwa AI).
