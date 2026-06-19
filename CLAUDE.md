# Szron.new — instrukcje projektu

## Deploy (WAŻNE)
- **Po przetestowaniu nowej funkcjonalności ZAWSZE wdrażaj na Netlify.** Nie zostawiaj zmian tylko lokalnie.
- Komenda deployu (produkcja): `netlify deploy --prod --build`
  - CLI jest zalogowane (eveo.tomek@gmail.com), katalog podpięty do projektu **szron-new** przez `.netlify/state.json`.
  - `--build` uruchamia `npm run build` → publikuje `dist/`. Site: https://szron-new.netlify.app
- Po deployu **pushuj commity** na git: remote `origin` = github.com/clone147/szron26, branch `main`.

## Architektura (skrót)
- Astro 5 (SSG, bez adaptera serwerowego). Strefa zamknięta (`/strefa`) = czysty vanilla JS + Supabase (schema `strefa`, RLS).
- Jedyny backend serwerowy to **Supabase Edge Functions** (kod poza repo) — wdrażane przez Supabase MCP/Dashboard, nie przez Netlify.
- Migracje DB też poza repo (Supabase). Projekt Supabase: `sttluvcbucpxzbcsuigw`.
