---
name: update-szron-pages
description: Aktualizuje podstrony Akademii SZRON (src/pages/*.astro) — weryfikuje fakty (wersje, komendy, modele, ceny) wobec oficjalnych docs + last30days, odświeża treść zachowując strukturę i ton (humanizer-pl), bumpuje widoczną datę "updated", buduje, deployuje na Netlify i pushuje. Użyj gdy user prosi o aktualizację/odświeżenie szkoleń Akademii, np. "zaktualizuj akademię", "odśwież szkolenia", "update szron pages", "sprawdź czy nic się nie zdezaktualizowało na akademii".
version: 1.0.0
user-invocable: true
argument-hint: "[all|<slug>[,<slug>...]] [--dry-run] [--no-deploy]"
allowed-tools: Read, Edit, Write, Bash, WebSearch, WebFetch, Skill, AskUserQuestion, Workflow, TodoWrite
---

# Update Szron Pages — automatyczna aktualizacja Akademii SZRON

Utrzymuje 12 podstron Akademii (menu „Akademia") w aktualnym stanie: usuwa przestarzałe fakty, dokłada brakujące, brzmi naturalnie po polsku i pokazuje datę ostatniej aktualizacji. Cel: **nigdy nic nieaktualnego dla programistów**, szybko, dla wszystkich stron naraz.

Projekt: Astro 5 SSG. Strony to samodzielne pliki `.astro` (treść inline w HTML/JSX, layout `Interior`, **bez** markdown/content-collection). Źródło prawdy o slugach: `src/data/akademia.mjs`.

---

## Cel i zakres — 12 podstron + źródła

| Slug | Temat | Autorytatywne źródła (research) |
|---|---|---|
| `claude-code` | Claude Code: instalacja, myślenie, workflow | code.claude.com/docs, docs.anthropic.com, release notes |
| `claude-code-bezpieczenstwo` | Bezpieczeństwo (deny rules, sandbox, hooks, VPC, modele lokalne) | code.claude.com/docs (settings, sandboxing, hooks, IAM) |
| `szkolenie-git` | Claude Code i Git | code.claude.com/docs (git, /review, GitHub) |
| `szkolenie-supabase-mcp` | MCP Supabase | supabase.com/docs (MCP), modelcontextprotocol.io |
| `szkolenie-mysql` | MySQL MCP Server | repo/npm danego MySQL MCP servera, modelcontextprotocol.io |
| `serwery-mcp` | Serwery MCP (Chrome DevTools MCP itd.) | modelcontextprotocol.io, github.com/ChromeDevTools/chrome-devtools-mcp |
| `tips-and-tricks` | Tips & Tricks | code.claude.com/docs, claude.com/blog, release notes |
| `petle` | Pętle (/goal, /loop) | code.claude.com/docs (slash commands, headless), claude.com/blog |
| `gemini-cli` | Gemini CLI | ai.google.dev, github.com/google-gemini/gemini-cli (UWAGA: przejście na Antigravity) |
| `codex-cli` | OpenAI Codex CLI | developers.openai.com, github.com/openai/codex |
| `lm-studio` | LM Studio | lmstudio.ai/docs |
| `llama-server` | Lokalny LLM (llama-server) | github.com/ggml-org/llama.cpp (tools/server README) |

Listę zawsze potwierdź czytając `src/data/akademia.mjs` (gdyby doszły nowe strony).

---

## Argumenty i flagi

Składnia: `/update-szron-pages [zakres] [flagi]`

- **zakres** (pozycyjny, opcjonalny):
  - brak lub `all` → wszystkie strony z `akademia.mjs` (domyślnie).
  - pojedynczy slug: `claude-code`.
  - lista po przecinku: `claude-code,gemini-cli,codex-cli`.
- **flagi**:
  - `--dry-run` — research + raport rozbieżności, **bez** edycji plików, builda i deployu. Najbezpieczniejszy podgląd.
  - `--no-deploy` — pełna edycja + build-check, ale **bez** `netlify deploy` i **bez** git push (zmiany zostają lokalnie do przejrzenia). Poinformuj usera wyraźnie.

**Domyślnie (bez flag): auto-deploy + push** — po zielonym buildzie deploy na Netlify i push, bez bramki akceptacji (zgodnie z `CLAUDE.md` projektu).

Walidacja: nieznany slug → przerwij i wypisz dozwolone slugi z `akademia.mjs`.

---

## Prerequisite: prop `updated` (już wdrożony)

Infrastruktura widocznej daty istnieje:
- `src/layouts/Interior.astro` przyjmuje prop `updated="YYYY-MM-DD"`, renderuje „Ostatnia aktualizacja: …" w hero i przekazuje `dateModified` do `pageSchema`.
- `src/data/page-schema.mjs` używa `ctx.dateModified || PUBLISHED`.

**Sprawdź na starcie** (Read), czy te dwa miejsca nadal mają obsługę `updated`. Jeśli ktoś ją usunął — przywróć (patrz git history), zanim ruszysz strony. Strony bez propu `updated` po prostu nie pokazują daty (fallback do globalnej `PUBLISHED`) — to bezpieczne.

---

## Per-page workflow (rdzeń) — extract → research → diff → rewrite → humanize → bump

Dla JEDNEJ strony:

### 1. Extract (read-only)
Przeczytaj `src/pages/<slug>.astro` + wiersz `<slug>` w `akademia.mjs`. Wypisz **weryfikowalne twierdzenia** (te się starzeją): numery wersji i wymagania, komendy instalacji/konfiguracji, składnia komend (`claude mcp add …`, flagi, `npx …@latest`), nazwy modeli, limity/budżety, ceny i darmowe limity, deprecations w istniejących calloutach „Aktualizacja:". Zanotuj **szkielet do zachowania**: liczba i kolejność sekcji, `aria-labelledby`/`id`, numeracja eyebrow (`01 / … 02 / …`), które sekcje `sect--dark`, blok „Powiązane szkolenia", CTA.

### 2. Research (zawsze: docs + last30days)
- Najpierw oficjalne docs (tabela źródeł wyżej): `WebSearch` → `WebFetch`, wyciągnij konkretne fakty (aktualna komenda, min. wersja, cennik, czy coś deprecated). Docs to **źródło autorytatywne**.
- **Zawsze** też `Skill last30days "<temat strony>" --agent` — świeże zmiany z 30 dni (nowy model, zmiana planu, nowa wersja, migracja narzędzia). To uzupełnienie, nie zastępuje docs.
- Dla każdego twierdzenia zapisz: **wartość na stronie → wartość ze źródła + URL** (to materiał do changelogu i commita).

### 3. Diff (klasyfikacja)
Każdemu twierdzeniu nadaj status: `OK` (zgodne — nie ruszaj), `OUTDATED` (źródło mówi inaczej → przepisz), `MISSING` (istotna nowość, której brak → dodaj), `UNCERTAIN` (źródła sprzeczne lub brak autorytatywnego potwierdzenia → **NIE zgaduj**, do raportu).

### 4. Rewrite (pełne odświeżenie sekcji dozwolone)
Możesz przebudować całą sekcję, gdy temat mocno się zmienił (np. nowy mechanizm zastąpił stary — jak `/effort` zamiast sztywnych budżetów `think/megathink/ultrathink`). Ale **zawsze zachowaj** zasady z „Reguły edycji" niżej. Świeże fakty wstawiaj w istniejącym wzorcu callouta: `<div class="callout"><p><strong>Aktualizacja:</strong> …</p></div>`. Edytuj przez `Edit` (string-replace), nie nadpisuj całego pliku.

### 5. Humanize (humanizer-pl)
Każdy nowo napisany/przepisany akapit przepuść przez `Skill humanizer-pl` — ma brzmieć jak pisane przez programistę-praktyka, bez AI-slopu i marketingowego pucu, ze zróżnicowanym rytmem zdań. **Zachowaj rejestr B2B** (nie zsuwaj w slang), polskie znaki i nazwy komend/flag (`/effort`, `ultrathink`, `Shift+Tab`, `MCP`, `npx`…). Nie zmieniaj faktów ani głosu marki.

### 6. Bump daty i metadanych
- Jeśli realnie coś zmieniłeś → ustaw `updated="<dzisiejsza data ISO>"` w `<Interior …>` tej strony (jeśli propu nie ma — dodaj go). **Zero zmian = nie bumpuj** (uczciwy `dateModified`).
- Jeśli temat się przesunął → zaktualizuj `description`/`title` (SEO) w propsach i `desc` tego sluga w `akademia.mjs`.
- Datę „dziś" w ISO ustal poleceniem `date +%F` (Bash) — nie zgaduj.

---

## Reguły edycji (NIE łam)

- Zachowaj 1:1 wszystkie klasy CSS: `sect`, `sect--dark`, `prose`, `proof-strip`, `eyebrow`, `callout`, `link-cards`, `link-card`, `cta-band`, `btn`, `sect-head`, `ws`, `rv`, `data-scramble`.
- Nie zmieniaj liczby/kolejności sekcji bez powodu, `aria-labelledby`/`id`, numeracji eyebrow.
- **Nigdy nie ruszaj**: bloku CTA, telefonu `+48 505 091 200`, linku `/umow-rozmowe`, `lead` ani claimów marki typu „uczymy tego, czego sami używamy".
- Jeśli zmienia się komenda/wersja — popraw **wszystkie** wystąpienia (proza, `<pre><code>`, `proof-strip`, `description`/`title`).
- Bez emoji, bez superlatyw, bez „rewolucyjny/przełomowy". Po polsku, konkretnie.

---

## Anty-halucynacja

- **„No source → no change".** Każda zmiana faktu musi mieć autorytatywny URL. Brak potwierdzenia → status `UNCERTAIN`, fakt zostaje jak jest.
- Priorytet źródeł: oficjalne docs/repo vendora > release notes > posty/last30days. Sprzeczność → trzymaj się docs; docs milczą → `UNCERTAIN`.
- `UNCERTAIN` **nie trafia do edycji** — ląduje w raporcie „Do ręcznego review". Jeśli interaktywnie i istotne → `AskUserQuestion`.
- Źródeł **nie renderuj** na stronie (marketing zostaje czysty) — trzymaj je w changelogu i treści commita.
- Idempotencja: ponowne uruchomienie bez nowych faktów = zero edycji, zero bumpu daty.

---

## Orchestracja — wszystkie strony naraz (ultracode → Workflow)

Różne pliki `.astro` = brak konfliktów edycji. Współdzielone pliki (`Interior.astro`, `page-schema.mjs`, `akademia.mjs`) edytuje **tylko** główny agent.

1. **Faza 0 (raz):** prerequisite-check propu `updated`.
2. **Faza 1 — fan-out (Workflow tool):** per strona niezależny task robi kroki 1–6, ograniczony do edycji **wyłącznie** swojego `src/pages/<slug>.astro`. Zmiany w `akademia.mjs` task tylko **proponuje** (zwraca patch wiersza). Zwraca też: changelog cytowań + listę `UNCERTAIN` + czy bumpnął datę. Batch ~4–6 równolegle (rate-limit web).
3. **Faza 2 — merge (główny agent):** zaaplikuj zebrane patche do `akademia.mjs`; złóż zbiorczy raport `UNCERTAIN`.
4. **Faza 3 — build raz:** patrz niżej.
5. **Faza 4 — deploy + commit:** patrz niżej (pomijane przy `--dry-run`/`--no-deploy`).

Dla pojedynczego sluga Workflow jest zbędny — zrób kroki 1–6 sekwencyjnie.

---

## Build, deploy, commit

- **Build (raz, po wszystkich edycjach):** `npm run build`. Build Astro bywa dłuższy niż domyślny timeout 20s — uruchom z większym `timeout` (np. 300000) albo w tle i monitoruj. **Deploy tylko gdy build zielony.** Błąd → zlokalizuj plik, napraw, rebuild.
- **Weryfikacja po buildzie:** sprawdź `dist/<slug>/index.html` — czy widać „Ostatnia aktualizacja", czy znikły stare fakty, czy `dateModified` w JSON-LD = nowa data.
- **Deploy (raz, na końcu):** `netlify deploy --prod --build` (CLI zalogowane, katalog podpięty do `szron-new`). Pomijane przy `--dry-run`/`--no-deploy`.
- **Commit — jeden zbiorczy** (nie per strona). Push na `origin` (github.com/clone147/szron26, branch `main`) po udanym deployu.

Format commita:
```
Akademia: aktualizacja faktów i dat (N stron)

Zaktualizowano: <slugi>
- <slug>: <było> → <jest> (<źródło URL>)
updated=<data> dla zmienionych stron; dateModified per-page.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

---

## Raport końcowy (zawsze)

Zwróć userowi:
1. **Changelog** per strona: `było → jest` + URL źródła.
2. **Strony zbumpowane** (z nową datą) vs **bez zmian**.
3. **Do ręcznego review** — lista `UNCERTAIN` z pytaniami.
4. **Status deploy**: URL produkcyjny + hash commita (albo „pominięto: --dry-run/--no-deploy").

---

## Ograniczenia / uwagi

- Timeout komend domyślnie 20s → build/deploy uruchamiaj z dłuższym `timeout` lub w tle.
- Brak `sudo`.
- Nie ruszać CTA, telefonu, `lead`, claimów marki.
- `--dry-run` nigdy nie edytuje plików ani nie deployuje.
