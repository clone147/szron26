# SZRON — pełny opis działalności

> Dokument przygotowany na podstawie przeglądu wszystkich podstron serwisu szron.tech (repo Szron.new, stan: lipiec 2026). Przeznaczenie: kontekst wejściowy dla pracy nad strategią dotarcia do nowych klientów na kolejny rok.

## 1. Kim jest SZRON

Butikowa, **dwuosobowa** firma wdrażająca **programowanie agentowe (AI)** w zespołach IT dużych firm:

- **Tomek Wojciechowski** — założyciel, 25 lat w IT. Ścieżka: Delphi/WinAPI (2001–07) → C++/web/embedded STM32/AVR, lider zespołu 8 os. (2007–14) → mobile Swift/Kotlin + doradztwo (2014–19) → CTO 40-osobowej firmy produktowej (2019–23) → SZRON (2023–). Odpowiada za AI workflow, trening i strategię. Stack: Claude Code, custom MCP, TypeScript, Java 21, Python.
- **Maciej Stopa** — Senior Full-stack/Mobile, 18 lat, specjalność „przepisywanie bez przepisywania" (modernizacja legacy). Tech lead w 3 scaleupach, mobile platform owner u operatora płatności (4M+ użytkowników), migracje Java 7→21, Spring Boot 1→3, Oracle→PostgreSQL, NFC. Stack: Java 21, Kotlin, Swift, Spring Boot 3, React Native, Qt6/QML, C++17, PostgreSQL 16, AWS ECS, Claude Code.

Razem 40+ lat doświadczenia, 3 lata pracy z LLM w produkcji (od premiery Claude Code). Nie agencja, nie software house — dwóch seniorów prowadzi każdy projekt osobiście od diagnozy do przekazania, bez account managerów i wymiany konsultantów.

**Domeny znane „od środka":** legacy (aplikacje rozwijane 20–30 lat), embedded/firmware, backendy event-driven, HMI/SCADA/Qt, mobile/NFC, operatorzy płatności, energetyka/przemysł.

## 2. Pozycjonowanie i USP

**Rdzeniowa obietnica (hero strony głównej):** „Wasz zespół IT. 2–4 razy szybszy. W dwa kwartały." Ci sami programiści, ten sam kod, nowy sposób pracy — bez wymiany ludzi i utraty wiedzy o biznesie.

**Zasada trzech reguł (manifest):**
1. Klient zostaje samodzielny — wdrożenie kończące się uzależnieniem od dostawcy „nie liczy się jako wdrożenie".
2. Stała opłata kwartalna, zamknięty zakres, bez T&M — brak interesu w przedłużaniu.
3. „Rozmawiamy z zarządem, ale piszemy z zespołem" — uczenie przez wspólny commit.

**Pozostałe wyróżniki:**
- Dwie osoby na każdym projekcie; dwa spojrzenia na każdy poważny PR „w cenie jednego".
- Mierzalność od tygodnia 1: metryki DORA + własne narzędzie DEVLens.
- Ton komunikacji: bezpośredni, antymarketingowy, „bez sales-talku" — jawnie mówią czego nie obiecują, kiedy pilot nie ma sensu, potrafią odesłać do konkurencji.
- Estetyka marki: „szron/lód + pomarańczowy rdzeń".

**Główny target:** zarządy i CTO dużych firm z zespołem IT 30+ osób (programy treningowe schodzą do 3–50+ devów). Zasięg: Polska + kraje nordyckie (zdalnie lub na żywo).

## 3. Oferta flagowa — program kwartalny (metoda)

Program 2 kwartały / 3 miesiące = **3 równoległe ścieżki na kodzie klienta**:
1. **Trening z AI** (prowadzi Tomek) — programowanie agentowe, Context Engineering, plan mode, subagenci, MCP, AGENTS.md/CLAUDE.md.
2. **Agentowe programowanie na obecnej aplikacji** — praca na realnych taskach z backlogu.
3. **Pilot modernizacji** jednego modułu na nowoczesny stos + natywny mobile iOS/Android (prowadzi Maciej).

Proces 4-krokowy: tydzień 1 diagnoza → tydzień 2 plan + wycena → tygodnie 3–10 trzy ścieżki → tygodnie 11–12 przekazanie. Bazy wspierane: MS SQL, MySQL, PostgreSQL, IBM DB2, Oracle.

**Obietnice:** dostarczanie 2–4× szybciej; koszt rozwoju -60% w nowym stosie; „6 miesięcy → 4 tygodnie"; programowanie intencyjne ~20× vs wspomagane. Baseline DORA w tygodniu 1, pomiar w tygodniu 12 (śr. 3–4 mergowane PR/dzień/dev).

**Model cenowy:** stała opłata kwartalna, kwota po diagnozie (wycena mailem w 48h). Gwarancja na stronie dla zespołów: „jeśli nie zobaczycie efektów — zwracamy pieniądze".

**Kontynuacja:** doradztwo technologiczne — stała współpraca miesięczna jako „doradca technologiczny zarządu + zewnętrzny dział R&D": roadmapa technologiczna, pomiar DEVLens, eliminacja opłat licencyjnych (np. komercyjna baza → PostgreSQL), AI on-premise (inwestycja rzędu ~100 tys. PLN).

## 4. Usługi i strony ofertowe (warianty)

Serwis utrzymuje kilka stron opisujących usługę treningową z różnych kątów / dla różnych ICP:

| Strona | Kąt / target |
|---|---|
| /transformacja-ai | zespoły dev; 4 kroki (audyt → strategia → optymalizacja → transfer); narzędzia Cursor, Claude Code, Copilot, Codex, Gemini CLI, MCP |
| /wdrozenia-ai | „Coaching Sprint" — praca na własnym kodzie/taskach z Jiry, 30 dni wsparcia |
| /augmentacja-pracownikow | Coaching Sprinty 2-tygodniowe; 2 dni szkolenia + ~2h/tydz. follow-up; championi, szablony |
| /dla-zespolow | zespoły 3–50+ devów; gwarancja zwrotu pieniędzy; PL + nordyki |
| /transformacja-ai-dla-programistow | CTO/tech leadzi; „kodowanie 55–80% szybciej" |
| /ai-dla-dev-teamow | najbardziej operacyjna: tabela „wspomaganie vs programowanie intencyjne", pełny workflow agentowy, pomiar DORA+DEVLens |
| /outsourcing-vs-inhouse-ai | strona porównawcza SEO: SZRON vs ekspert AI in-house (in-house sensowny od ~100+ osób) |
| /darmowy-audyt | lead magnet górnego lejka: bezpłatna rozmowa + pisemna notatka z rekomendacjami w 1–2 dni, „nie pitch" |
| /mobile-apps | aplikacje iOS/Android w React Native + AI, płatności (Apple Pay, Google Pay, BLIK), PCI DSS |

## 5. Branże (strony wertykalne)

- **Przemysł/energetyka** (/ai-dla-przemyslu): modernizacja HMI/SCADA (Qt6/QML, OPC UA), sterowniki/firmware, monolit→moduły bez „big bang", modele on-prem (Ollama, llama.cpp). Czasy: 30 min diagnoza / 2 tyg. pilot / 1–3 mc wdrożenie.
- **Embedded/firmware** (/ai-dla-embedded): ton antyhype — „nie napiszemy Wam firmware, zdejmiemy 70% pracy dookoła" (testy, parsery protokołów, dokumentacja rejestrów). Keil/STM32, hardware-in-the-loop, MISRA C, modele lokalne.
- **Sektor regulowany** (/ai-sektor-regulowany): obronność, fintech, medycyna. Architektura bezpieczeństwa najpierw: kod nie idzie do publicznych modeli, Bedrock w prywatnym VPC, modele lokalne (Ollama/vLLM), wariant air-gapped, audit log, AI Act/NIS2/RODO, NDA przed rozmową.
- **AI Act** (/ai-act-compliance): regulacyjny lead magnet — timeline (high-risk od 2.08.2026), kary do 35 mln EUR / 7% obrotu, checklista, CTA „Umów audyt zgodności".
- **Pilot procesu back-office** (/ai-pilot-procesu): pilot AI w jednym procesie w 2–4 tygodnie, pomiar przed/po, raport + rekomendacja.
- **Transport i płatności**: systemy biletowe, POS (case RegioBus).

## 6. Dowody / case studies (powtarzalne filary)

- **RegioBus Systems** (transport): system biletowy NFC — 6 miesięcy → 4 tygodnie, 3 z 4 devów uwolnione, oszczędności setki tys. zł/rok.
- **STM32** (embedded): moduł Modbus RTU + CANopen — 2 miesiące → 2 tygodnie, pętla feedbacku 30 → 4 min, 3/3 inżynierów używa AI w dniu 14.
- **HMI energetyka**: nowy moduł w 2 tyg. (odkładany 1,5 roku), migracja Qt5→Qt6 przy okazji, pokrycie testami QML 0% → 41%, 3 widoki dorobione samodzielnie przez zespół.
- Cytaty: wiceprezes Comarch (czerwiec 2026), NYT (maj 2025), badania GitHub Copilot (~55% szybsze kodowanie).

## 7. Produkty i narzędzia własne

- **DEVLens** (/devlens): platforma analityczna dla C-level — wydajność zespołów z repo GitHub/GitLab, Bus Factor, multi-repo, 100% lokalnie (dane w przeglądarce), self-hosting enterprise, wdrożenie 1–2 dni, read-only token.
- **Kalkulator ROI AI** (/kalkulator-roi-ai): interaktywny, w przeglądarce, 5 suwaków, ~55% wg danych Copilota.
- **Quiz gotowości na AI** (/quiz): 8 pytań, ~3 min, ocena w przeglądarce.
- **Open source** (/open-source): szron-db2-mcp (MCP server do IBM DB2), skill-imagegen (Claude Code Skill do generowania obrazów) — budowanie wiarygodności technicznej.
- **Zasoby** (/zasoby): AI Coding Playbook dla enterprise (PDF 28 stron, porównanie narzędzi, szablon CLAUDE.md), checklisty, self-assessment — dostęp przez umówienie rozmowy.

## 8. Akademia SZRON (otwarta wiedza, SEO)

Hub 12 ścieżek szkoleniowych z wdrożeń (/akademia), regularnie aktualizowanych:
Claude Code (podstawy) · bezpieczeństwo Claude Code (deny rules, sandbox, hooki) · Git z Claude Code · Supabase MCP · MySQL/MariaDB MCP · serwery MCP + Chrome DevTools · tips & tricks (hooki, /rewind, slash-commands, Skills) · pętle /goal i /loop · Gemini CLI / Antigravity · Codex CLI · LM Studio (lokalne LLM, RODO) · llama-server (llama.cpp).

**Warsztat embedded** (/warsztat-embedded) — płatny produkt z jawną ceną: 1-dniowy zamknięty warsztat „Claude Code dla embedded/C++", do 10 osób, na sprzęcie klienta, kod od zera (bez NDA). **7 500 zł netto/grupa; z dofinansowaniem KFS/BUR do -80% dla MŚP → efektywnie od ~1 500 zł.** Deliverables: Embedded AI Starter Pack (CLAUDE.md dla STM32/Zephyr/Qt, MCP do datasheetów PDF, skill MISRA-check). Gwarancja: brak pierwszego zadania z AI w 2 tyg. → druga sesja gratis. Strona-para /dla-szefa: jednostronicowe streszczenie dla decydenta („ktoś z zespołu przesłał Ci tę stronę").

## 9. Treści, eventy, lejek

- **Blog** (/blog): „z okopów, bez marketingu".
- **Aktualności** (/aktualnosci): archiwum zrealizowanych warsztatów (Context Engineering, MCP, embedded STM32, C++ Builder, React Native, Keil) — „po 2h uczestnicy używają agentów samodzielnie".
- **Webinar AI dla CEO** (/webinar-ai-dla-ceo): bezpłatny, 45 min, dla C-level.
- **Zjazd 91** (/zjazd-91): reaktywacja bazy — darmowy reunion online (90 min, zero sprzedaży) dla 91 inżynierów z 61 firm z warsztatów ARM 2023 (Wrocław, Katowice, Kraków, Warszawa, Poznań).
- **Konwersja**: /umow-rozmowe i /kontakt — 30-min diagnoza prowadzona przez Tomka, NDA w 24h, odpowiedź 24h, wycena kwartału w 48h. Tel. +48 505 091 200, tw@szron.tech / ms@szron.tech.

## 10. Obserwacje strategiczne (surowe, do pracy nad strategią)

1. **Dualizm narracji**: strony flagowe (index, metoda, o-nas, ai-dla-dev-teamow) mówią „my dwójka, kwartał, pilot, 2–4×, stała opłata"; starsza warstwa (transformacja-ai, wdrozenia-ai, dla-zespolow) częściowo mówi „ja/konsultant" i używa bardziej marketingowych liczb ROI (150–300%, +35–55% przychodów). Potencjalna niespójność pozycjonowania.
2. **Ceny jawne tylko w segmencie embedded**: warsztat 7 500 zł netto (KFS -80%), AI on-premise ~100 tys. PLN. Reszta: „stała opłata, kwota po diagnozie".
3. **Dwa ICP obsługiwane równolegle**: (a) zarząd/CTO enterprise (program kwartalny, doradztwo, sektor regulowany, DEVLens) oraz (b) zespoły/inżynierowie embedded (warsztat, dla-szefa, zjazd-91, Akademia).
4. **Compliance jako oś sprzedaży dla regulowanych**: modele lokalne / VPC / air-gapped / audit log / NDA przed rozmową — konsekwentnie w całym serwisie.
5. **Silne aktywa górnego lejka**: Akademia (SEO), kalkulator ROI, quiz, playbook PDF, open source, webinar, zjazd — dużo punktów wejścia, wszystkie kierują do 30-min diagnozy.
