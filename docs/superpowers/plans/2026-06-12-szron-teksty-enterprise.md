# Przeróbka tekstów szron.tech pod enterprise — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przerobić `teksty-strony-nowe.md` tak, by produktem flagowym była transformacja zespołu IT (30+ osób) z pilotem modernizacji jako dowodem — zgodnie ze spec `docs/superpowers/specs/2026-06-12-szron-teksty-design.md`.

**Architecture:** Jeden plik markdown z 7 podstronami. Edycje sekcja po sekcji narzędziem Edit (dokładne pary stary→nowy tekst), po każdym zadaniu weryfikacja grepem i commit. Ton: humanizer-pl (konkrety, zróżnicowany rytm zdań, polska powściągliwość).

**Tech Stack:** markdown, git, grep.

**Plik modyfikowany we wszystkich zadaniach:** `teksty-strony-nowe.md`

---

### Task 1: Hero strony głównej + komunikat kwalifikacji

- [ ] **Step 1: Podmień blok hero**

Stary fragment (od `# Nowoczesna aplikacja` do linii `Dwóch seniorów…`):

```markdown
# Nowoczesna aplikacja, którą rozwija Wasz dotychczasowy zespół. W jeden kwartał.

Szkolimy Wasz zespół z AI, wprowadzamy go w programowanie agentowe na obecnym kodzie, a modernizację do nowoczesnego stosu zespół przeprowadza już sam — z naszym wsparciem, razem z natywnymi wersjami na iOS i Androida. Ci sami programiści, którzy znają Wasz biznes. Tylko teraz dostarczają 2 do 4 razy szybciej.
Umów 30-minutową rozmowę → Zobacz, jak pracujemy
Dwóch seniorów, 40+ lat łącznie w branży. Trzy lata z LLM-ami w produkcji. Mówimy wprost z zarządem i CTO, diagnozę prowadzi założyciel, kod piszemy razem z Waszym zespołem.
```

Nowy:

```markdown
# Wasz zespół IT. 2–4 razy szybszy. W jeden kwartał.

Wdrażamy programowanie agentowe w zespołach IT dużych firm — na Waszym kodzie, nie na slajdach. Szkolimy zespół z AI, wprowadzamy agentów do codziennej pracy, a dowodem jest pilot: jeden moduł zmodernizowany do nowoczesnego stosu jeszcze w tym samym kwartale. Ci sami programiści, którzy znają Wasz biznes — tylko teraz dostarczają 2 do 4 razy szybciej.
Umów 30-minutową rozmowę → Zobacz, jak pracujemy
Pracujemy z firmami, których zespół IT liczy 30+ osób.
Dwóch seniorów, 40+ lat łącznie w branży. Trzy lata z LLM-ami w produkcji. Mówimy wprost z zarządem i CTO, diagnozę prowadzi założyciel, kod piszemy razem z Waszym zespołem.
```

- [ ] **Step 2: Weryfikacja**

Run: `grep -c "2–4 razy szybszy" teksty-strony-nowe.md`
Expected: `1` (hero). `grep -c "Pracujemy z firmami, których zespół IT liczy 30+" teksty-strony-nowe.md` → `1`.

- [ ] **Step 3: Commit**

```bash
git add teksty-strony-nowe.md && git commit -m "copy: hero pod transformację zespołu + komunikat kwalifikacji 30+"
```

---

### Task 2: Sekcja Problem + branże w 4 segmentach

- [ ] **Step 1: Podmień nagłówek i punkty a/b/c sekcji 01**

Stary:

```markdown
## Klasyczna modernizacja zostawia Was z aplikacją, której nikt u Was nie ogarnia.

a. Konkurencja wypuszcza szybciej. Wasz zespół IT pracuje na pełnych obrotach, a aplikacja rozwijana od 20–30 lat kosztuje w utrzymaniu coraz więcej. Programistów znających te technologie ubywa.
b. Klasyczne wyjście — przepisanie na nowoczesny stos — kończy się tym samym problemem: nowa technologia, której Wasz zespół nie zna. Trzeba zatrudniać nowych ludzi, tracicie tych, którzy znają biznes, a projekt rozciąga się na lata.
c. AI obiecuje rozwiązanie. Ale jak je wykorzystać, żeby powstała nowoczesna wersja Waszej aplikacji?
```

Nowy:

```markdown
## Wasz zespół zna biznes lepiej niż ktokolwiek na rynku. Tylko dostarcza wolniej, niż biznes potrzebuje.

a. Konkurencja wypuszcza szybciej. Wasz zespół IT pracuje na pełnych obrotach, a aplikacje rozwijane od 20–30 lat kosztują w utrzymaniu coraz więcej. Każda zmiana idzie tygodniami.
b. Klasyczne odpowiedzi nie skalują się przy 30+ osobach. Rekrutacja trwa pół roku i podbija koszty. Outsourcing oddaje wiedzę o biznesie na zewnątrz. Rewrite całego systemu kończy się technologią, której zespół nie zna.
c. AI obiecuje rozwiązanie. Ale pojedyncze licencje na copilota nie zmieniają tempa zespołu — zmienia je dopiero nowy sposób pracy.
```

- [ ] **Step 2: Podmień listę branż**

Stary: `Embedded i IoT / Software house / Systemy POS / Energetyka / Telco i pomiary / Maszyny i CNC / Obronność / Automotive / R&D i uczelnie`

Nowy: `Przemysł i energetyka (embedded/IoT, maszyny i CNC, automotive) / Transport i płatności (systemy biletowe, POS) / Sektor regulowany (obronność, fintech, medycyna) / Software house, telco, R&D`

- [ ] **Step 3: Weryfikacja i commit**

Run: `grep -c "Sektor regulowany" teksty-strony-nowe.md` → `1`.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: problem zarządu od tempa zespołu, branże w 4 segmentach"
```

---

### Task 3: Metoda — lead, ścieżka 3 jako Pilot modernizacji, wchłonięcie sekcji 05

- [ ] **Step 1: Podmień nagłówek i lead sekcji 03 / Metoda**

Stary nagłówek: `## Trening AI, programowanie agentowe i modernizacja. W tym samym kwartale.`
Nowy nagłówek: `## Trening AI, programowanie agentowe i pilot modernizacji. W tym samym kwartale.`

Stary lead (akapit zaczynający się od `Trzy ścieżki idą równolegle. Najpierw szkolimy…`) podmień na:

```markdown
Trzy ścieżki idą równolegle. Najpierw szkolimy Wasz zespół z AI — żeby każdy programista umiał prowadzić agenta w codziennej pracy. Potem wprowadzamy programowanie agentowe na Waszej obecnej aplikacji, bez ryzyka, na kodzie, który ludzie znają. Dowodem jest pilot: zespół modernizuje jeden moduł do stosu, w którym AI najmocniej obniża koszt rozwoju — i wypuszcza go też natywnie na iOS i Androida. My prowadzimy: Tomek bierze AI workflow, architekturę i rozmowy z zarządem, Maciej — backend, mobile i frontend. Po kwartale zespół ma nowy sposób pracy, zmierzony wynik i wzorzec, którym sam obejmuje resztę systemu.
```

- [ ] **Step 2: Podmień ścieżkę 03 (cały blok od `### Modernizacja aplikacji` do `Prowadzi: Maciej…`)**

Nowy blok:

```markdown
### Pilot modernizacji

Zespół przenosi jeden moduł lub aplikację na nowoczesny stos, w którym AI obniża koszt rozwoju nawet o 60%. My doradzamy, pokazujemy wzorzec, a trudne fragmenty bierzemy na siebie. Pilot to dowód metody — po kwartale zespół tym samym wzorcem obejmuje kolejne moduły.

Platforma | Desktop, web, SaaS — jedna aplikacja, wybór formy dostawy
Mobile | Natywne iOS i Android z jednego kodu, w tym samym kwartale
Architektura | Monolit → moduły, stopniowo, bez „big bang"
Dane i integracje | Wasza baza zostaje bez zmian (MS SQL, MySQL, PostgreSQL, DB2, Oracle), API działają jak wcześniej

Czego nie obiecujemy
- Nie obiecujemy „identycznej kopii". Pilot to okazja, żeby naprawić to, co od lat irytowało użytkowników.
- Nie zaczynamy bez analizy. Diagnoza mówi uczciwie, czy pilot ma sens i od którego modułu zacząć.

Pod NDA
Pierwsze programy prowadzimy pod NDA. Konkretne wyniki i nazwy klientów zaczniemy publikować w drugiej połowie 2026 roku.

Prowadzi: Maciej Stopa (backend/mobile/frontend) + Tomek (architektura)
```

- [ ] **Step 3: Usuń całą sekcję `05 / Modernizacja Co dokładnie robimy`** (od linii `05 / Modernizacja` do linii przed `06 / Korzyści`) — jej treść wchłonął Step 2.

- [ ] **Step 4: Podmień blok „=" (claim po ścieżkach)**

Stary: `### Nowoczesna aplikacja, którą rozwija Wasz dotychczasowy zespół.`
Nowy: `### Zespół, który znacie. Tempo, którego nie znacie.`
(linia `Bez wymiany ludzi. Bez utraty wiedzy o biznesie. W 3 miesiące, za stałą opłatę.` zostaje)

- [ ] **Step 5: Renumeracja sekcji index**

`06 / Korzyści` → `05 / Korzyści`, `07 / Case study` → `06 / Case study`, `08 / Wyniki` → `07 / Wyniki`, `09 / Proces` → `08 / Proces`, `10 / Zespół` → `09 / Zespół`, `11 / FAQ` → `10 / FAQ`.

- [ ] **Step 6: Weryfikacja i commit**

Run: `grep -c "Pilot modernizacji" teksty-strony-nowe.md` → ≥2; `grep -c "05 / Modernizacja" teksty-strony-nowe.md` → `0`.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: metoda z pilotem modernizacji jako ścieżką-dowodem, merge sekcji 05"
```

---

### Task 4: Co robimy inaczej + Korzyści

- [ ] **Step 1: Podmień sekcję `04 / Co robimy inaczej`**

Stary nagłówek: `## Sama nowa aplikacja to za mało. Bez przyspieszenia zespołu zostajecie z drogim systemem, którego nikt nie ogarnia.`

Nowy blok (nagłówek + 2 akapity):

```markdown
## Samo szkolenie to za mało. Bez wdrożenia w codzienną pracę zostajecie z certyfikatami i starym tempem.

Trzy ścieżki idą równolegle, nie po kolei. Zespół uczy się AI na własnej aplikacji — w stosie, który zna. Kiedy startuje pilot modernizacji, programiści już wiedzą, jak prowadzić agenta. Nowy sposób pracy od pierwszego dnia jest ich sposobem, nie naszym.
Cały program trwa 3 miesiące, nie rok. Stara aplikacja działa bez przerwy, pilot wchodzi obok, mobile razem z webem. Bez „big bang" i bez ryzyka, że wszystko padnie w jeden weekend.
```

- [ ] **Step 2: Podmień trzy korzyści (cała sekcja Korzyści, punkty 01–03)**

```markdown
01 / Tempo

#### Zespół dostarcza 2–4 razy szybciej.

To, co zajmowało 6 miesięcy, zespół dostarcza w 4 tygodnie. Wcześniejszy przychód, szybsza reakcja na konkurencję. Mierzone DORA metrics od pierwszego tygodnia, nie deklaracjami.

02 / Ludzie

#### Ci sami ludzie, nowe kompetencje.

Nie zatrudniacie nowych ludzi i nie tracicie wiedzy o biznesie. Programiści, którzy pracują z AI, rzadziej odchodzą — a Wasza firma staje się pracodawcą, do którego się aplikuje.

03 / Koszt

#### Niższy koszt rozwoju, z pilotem jako mnożnikiem.

W stosie z pilota koszt dalszego rozwoju spada nawet o 60% — a wzorzec skaluje się na kolejne moduły. W ramach stałego doradztwa idziemy dalej: eliminujemy opłaty licencyjne za zamknięte technologie. → Zobacz Doradztwo
```

- [ ] **Step 3: Weryfikacja i commit**

Run: `grep -c "Samo szkolenie to za mało" teksty-strony-nowe.md` → `1`.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: co robimy inaczej + korzyści z perspektywy zespołu"
```

---

### Task 5: Case RegioBus na index + proces

- [ ] **Step 1: Dodaj ramkę pilota i podmień metrykę w sekcji Case study (index)**

Po linii `Lead operacyjny: Maciej Stopa (backend + mobile NFC) · Tomek (AI workflow)` dodaj:

```markdown
Skala pilota: 4-osobowy zespół, jeden system. To samo robimy z jednym zespołem w Waszej organizacji — falami, zespół po zespole.
```

Stara metryka: `Zespół 4 osoby → 1 osoba`
Nowa: `Zespół 3 z 4 osób uwolnione do nowych projektów · 0 odejść`

- [ ] **Step 2: Podmień opis kroku 03 procesu**

Stary: `Trening z AI, agentowe programowanie na obecnym kodzie i modernizacja do nowego stosu — z natywnym mobile.`
Nowy: `Dwie ścieżki treningowe — AI i agentowe programowanie na obecnym kodzie — plus pilot modernizacji z natywnym mobile.`

- [ ] **Step 3: Weryfikacja i commit**

Run: `grep -c "Skala pilota" teksty-strony-nowe.md` → `1`; `grep -n "4 osoby → 1 osoba" teksty-strony-nowe.md` → trafienia tylko w sekcjach case studies (lista + case RegioBus), nie na index (te zmienia Task 8).

```bash
git add teksty-strony-nowe.md && git commit -m "copy: case RegioBus na index jako pilot, proces z pilotem"
```

---

### Task 6: FAQ (7 pytań) + Kontakt + footer ×7

- [ ] **Step 1: Skróć FAQ 05 (ciągłość działania) i przeramuj na pilota**

Stary (pytanie 05): cały akapit `Tak. Stara aplikacja działa równolegle do końca migracji…`
Nowy:

```markdown
05 Czy stara aplikacja będzie działać w trakcie pilota?+
Tak. Pilot wchodzi obok: dwa systemy równolegle, moduł po module, testy regresyjne na danych z produkcji. Wasza baza danych zostaje bez zmian.
```

- [ ] **Step 2: Dodaj nowe pytanie po pytaniu 05, przed „06 Kto będzie pracował…"; dotychczasowe 06 przenumeruj na 07**

```markdown
06 Czy to działa przy zespole 50+ osób?+
Tak — falami. Nie szkolimy 50 osób naraz. Zaczynamy od jednego zespołu (5–10 osób) i pilota, wzorce zapisujemy w CLAUDE.md i standardach repo, a przeszkoleni programiści zostają championami kolejnych fal. Druga fala kosztuje mniej niż pierwsza, trzecia mniej niż druga.
```

- [ ] **Step 3: Podmień sekcję Kontakt (nagłówek + 1. akapit + komunikat kwalifikacji)**

Stary nagłówek: `## 30 minut. Pokażemy, gdzie Wasza firma traci pieniądze w IT.`
Nowy blok:

```markdown
## 30 minut. Pokażemy, gdzie Wasz zespół IT traci tempo.

W jednym kwartale dzieją się trzy rzeczy: szkolimy Wasz zespół z AI, wprowadzamy programowanie agentowe na obecnej aplikacji, a pilot modernizacji potwierdza wynik na produkcji. Po kwartale zespół dostarcza 2–4 razy szybciej i sam obejmuje wzorcem resztę systemu.
Pracujemy z firmami, których zespół IT liczy 30+ osób.
Rozmowę prowadzi Tomek. W ciągu 48h dostajecie wycenę zatwierdzoną przez nas obu — bo to my będziemy ten projekt robić. Bez prezentacji, bez oferty handlowej. Konkretne liczby, które wykorzystacie niezależnie od dalszej decyzji.
```

- [ ] **Step 4: Footer — podmień opis firmy we wszystkich 7 wystąpieniach**

Stary: `Modernizacja aplikacji i AI dla zespołów IT w dużych firmach.`
Nowy: `Transformacja zespołów IT i programowanie agentowe dla dużych firm.`
(Edit z `replace_all: true`)

- [ ] **Step 5: Weryfikacja i commit**

Run: `grep -c "Transformacja zespołów IT i programowanie agentowe" teksty-strony-nowe.md` → `7`; `grep -c "falami" teksty-strony-nowe.md` → ≥2.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: FAQ 7 pytań (fale, pilot), kontakt pod flagowca, footer x7"
```

---

### Task 7: Podstrona Zespół — język transformacji

- [ ] **Step 1: Hero podstrony**

Stary: `# Dwójka, która prowadzi każde wdrożenie SZRON od pierwszej do ostatniej linijki.`
Nowy: `# Dwójka, która prowadzi każdą transformację SZRON od pierwszej do ostatniej linijki.`

- [ ] **Step 2: Profil Macieja**

Stary: `- Prowadzę warstwę backend, frontend i mobile w projektach modernizacji.`
Nowy: `- Prowadzę warstwę backend, frontend i mobile — w treningu zespołów i w pilotach modernizacji.`

Stary (lead profilu): `Jestem w SZRON człowiekiem od „przepisywania bez przepisywania".`— zostaje (dotyczy pilotów, spójne).

- [ ] **Step 3: Weryfikacja i commit**

Run: `grep -c "każdą transformację SZRON" teksty-strony-nowe.md` → `1`.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: podstrona zespołu pod język transformacji"
```

---

### Task 8: Case studies — lista i 3 case'y jako piloty

- [ ] **Step 1: Lead listy case studies**

Stary: `Każdy projekt SZRON kończy się dwoma rzeczami: działającym produktem i zespołem, który potrafi go dalej rozwijać. Wszystkie trzy case'y poniżej prowadziła ta sama dwójka: Tomek i Maciej. Co projekt — inny lider operacyjny, ten sam zespół merytoryczny.`

Nowy: `Trzy piloty w trzech branżach. Każdy prowadzony tak, jak pierwszy kwartał u Was: zespół klienta plus nasza dwójka — Tomek i Maciej. Każdy kończy się dwoma rzeczami: działającym produktem i zespołem, który rozwija go dalej sam.`

- [ ] **Step 2: Karta RegioBus na liście — metryka**

Stary: `Zespół 4 osoby → 1 osoba`
Nowy: `Zespół 3 z 4 osób uwolnione · 0 odejść`

- [ ] **Step 3: Case RegioBus (podstrona) — hero i metryki**

W metrykach hero: stary `Wielkość zespołu 4 osoby → 1 osoba` → nowy `Zespół 3 z 4 osób uwolnione · 0 odejść`.
W leadzie po pierwszym akapicie dodaj zdanie: `Skala pilota: tak wygląda pierwszy kwartał, gdy zespół ma 4 osoby. Przy 30+ pracujemy falami, zespół po zespole.`
Cytat CTO zostaje bez zmian (autentyczna wypowiedź; sekcja „Wynik" wyjaśnia: 0 odejść).

W sekcji „Wynik" tego case'u podmień bullet:
Stary: `- Zespół utrzymaniowy: 4 osoby → 1 osoba z asystentem AI. Pozostałych trzech programistów przesunięto do nowych inicjatyw — zachowali pracę, dostali nowe wyzwania.`
Nowy: `- Zespół utrzymaniowy: z 4 osób przy starym systemie została 1 z asystentem AI. Pozostałych trzech przesunięto do nowych inicjatyw — zachowali pracę, dostali nowe wyzwania. 0 odejść z firmy.`

- [ ] **Step 4: Case STM32 i case HMI — dopisek skali w leadzie**

Po pierwszym akapicie leadu każdego z dwóch case'ów dodaj zdanie:
`Skala pilota: tak wygląda pierwszy kwartał przy zespole 3–4 osób. Przy 30+ pracujemy falami, zespół po zespole.`

- [ ] **Step 5: Weryfikacja i commit**

Run: `grep -c "Skala pilota" teksty-strony-nowe.md` → `4` (index + 3 case'y); `grep -c "4 osoby → 1 osoba" teksty-strony-nowe.md` → `0`.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: case studies przeramowane jako piloty, metryki bez redukcji etatów"
```

---

### Task 9: Doradztwo — kwartał transformacji

- [ ] **Step 1: Zamiany fraz**

- Stary: `Kwartał modernizacji kończy się samodzielnym zespołem.` → Nowy: `Kwartał transformacji kończy się samodzielnym zespołem.`
- Stary: `Start Po kwartale modernizacji albo niezależnie od niego` → Nowy: `Start Po kwartale transformacji albo niezależnie od niego`
- Stary: `Czy musimy najpierw przejść kwartał modernizacji?` → Nowy: `Czy musimy najpierw przejść kwartał transformacji?`
- Stary (w odpowiedzi FAQ): `Kwartał modernizacji można dołożyć później` → Nowy: `Kwartał transformacji można dołożyć później`
- Stary (kontakt doradztwa): `Jeśli z rozmowy wyjdzie, że wystarczy Wam kwartał modernizacji albo w ogóle nic — powiemy to wprost.` → Nowy: `Jeśli z rozmowy wyjdzie, że wystarczy Wam kwartał transformacji albo w ogóle nic — powiemy to wprost.`

- [ ] **Step 2: Weryfikacja i commit**

Run: `grep -c "kwartał modernizacji" teksty-strony-nowe.md` (case-insensitive: `grep -ci`) → `0`.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: doradztwo jako kontynuacja kwartału transformacji"
```

---

### Task 10: Umów rozmowę — widełki, kwalifikacja, pole opisowe

- [ ] **Step 1: Widełki zespołu IT**

Stary: `Zespół IT 3–10 osób · 10–30 osób · 30–100 osób · 100+ osób`
Nowy: `Zespół IT 30–100 osób · 100–300 osób · 300+ osób`

- [ ] **Step 2: Komunikat kwalifikacji nad formularzem**

Po linii `## Krótki formularz — wracamy w 24h.` dodaj akapit:

```markdown
Pracujemy z firmami, których zespół IT liczy 30+ osób. Jeśli Wasz jest mniejszy — napiszcie, ale uprzedzamy: program kwartalny projektujemy pod duże organizacje.
```

- [ ] **Step 3: Pole opisowe formularza**

Stary: `Jednym zdaniem — aplikacja, którą chcecie zmodernizować. Nie szczegóły techniczne — kontekst. Stos, wielkość, kto utrzymuje.`
Nowy: `Jednym zdaniem — zespół i aplikacja: ile osób, jaki stos, co Was spowalnia.`

- [ ] **Step 4: Weryfikacja i commit**

Run: `grep -c "3–10 osób" teksty-strony-nowe.md` → `0`; `grep -c "30–100 osób" teksty-strony-nowe.md` → `1`.

```bash
git add teksty-strony-nowe.md && git commit -m "copy: formularz od 30+, komunikat kwalifikacji, pole opisowe"
```

---

### Task 11: Weryfikacja końcowa (kryteria sukcesu ze spec)

- [ ] **Step 1: Grepy kontrolne — wszystkie muszą zwrócić 0 trafień**

```bash
grep -n "Nowoczesna aplikacja, którą rozwija" teksty-strony-nowe.md
grep -n "4 osoby → 1 osoba" teksty-strony-nowe.md
grep -n "3–10 osób\|10–30 osób" teksty-strony-nowe.md
grep -ni "kwartał modernizacji" teksty-strony-nowe.md
```

- [ ] **Step 2: Grepy obecności — oczekiwane liczby**

```bash
grep -c "Pracujemy z firmami, których zespół IT liczy 30+" teksty-strony-nowe.md   # 3 (hero, kontakt, formularz)
grep -c "Skala pilota" teksty-strony-nowe.md                                        # 4
grep -c "Transformacja zespołów IT i programowanie agentowe" teksty-strony-nowe.md  # 7
```

- [ ] **Step 3: Pass humanizer-pl na nowych fragmentach**

Przeczytaj zmienione bloki (hero, problem, metoda-lead, korzyści, FAQ 06, kontakt) pod kątem checklisty humanizer-pl: rytm zdań (krótkie + długie), brak słownictwa AI (kluczowy/innowacyjny/ponadto), konkrety zamiast przymiotników, spójny rejestr. Popraw inline, jeśli coś zgrzyta.

- [ ] **Step 4: Commit końcowy**

```bash
git add teksty-strony-nowe.md && git commit -m "copy: final pass humanizer-pl po przeróbce enterprise"
```
