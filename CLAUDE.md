# Szron.new — instrukcje projektu

## Deploy (WAŻNE)
- **Po przetestowaniu nowej funkcjonalności ZAWSZE wdrażaj na Netlify.** Nie zostawiaj zmian tylko lokalnie.
- Komenda deployu (produkcja): `netlify deploy --prod --build`
  - CLI jest zalogowane (eveo.tomek@gmail.com), katalog podpięty do projektu **szron-new** przez `.netlify/state.json`.
  - `--build` uruchamia `npm run build` → publikuje `dist/`. Produkcja: **https://szron.tech** (domena podpięta do projektu szron-new; alias: https://szron-new.netlify.app)
- Po deployu **pushuj commity** na git: remote `origin` = github.com/clone147/szron26, branch `main`.

## Architektura (skrót)
- Astro 5 (SSG, bez adaptera serwerowego). Strefa zamknięta (`/strefa`) = czysty vanilla JS + Supabase (schema `strefa`, RLS).
- Jedyny backend serwerowy to **Supabase Edge Functions** (kod poza repo) — wdrażane przez Supabase MCP/Dashboard, nie przez Netlify.
- Migracje DB też poza repo (Supabase). Projekt Supabase: `sttluvcbucpxzbcsuigw`.

## Furtka dev-login (dla agenta Claude — testy stron wymagających zalogowania)
- Strefa `/strefa/*` wymaga sesji Supabase. Do testów bez udziału Tomka użyj furtki:
  `bash scripts/dev-login.sh` → zwraca JSON z `url` (magic-link dla eveo.tomek@gmail.com).
  Otwórz ten URL w przeglądarce (np. karta claude-in-chrome) — ustawia sesję strefy i
  przekierowuje na `https://szron.tech/strefa/`. Link jest jednorazowy i krótkotrwały —
  generuj świeży przy każdym teście.
- Mechanika: edge function `dev-login` (Supabase, verify_jwt=false) sprawdza SHA-256
  tokenu i przez service_role generuje magic-link WYŁĄCZNIE dla eveo.tomek@gmail.com,
  z redirectem tylko na szron.tech / szron-new.netlify.app. Token żyje TYLKO w
  `~/.secrets` na tym laptopie (zmienna `SZRON_DEV_LOGIN_TOKEN`) — w repo i w funkcji
  jest wyłącznie hash. NIGDY nie commituj tokenu ani nie wklejaj go do plików w repo.
- Rotacja: nowy token → `openssl rand -hex 32` do `~/.secrets`, hash `shasum -a 256`,
  podmień `TOKEN_SHA256` w funkcji i wdróż ją ponownie (Supabase MCP `deploy_edge_function`).
