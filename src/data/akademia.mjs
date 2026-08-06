// Akademia SZRON — lista szkoleń (źródło dla dropdownu nav, strony /akademia i stron szkoleniowych)
export const akademia = [
  { slug: 'claude-code',              title: 'Claude Code',                 desc: 'Instalacja, poziomy myślenia, workflow agentowy od podstaw.' },
  { slug: 'claude-code-bezpieczenstwo', title: 'Claude Code — bezpieczeństwo', desc: 'Praca z AI na kodzie firmowym bez wycieku: deny rules, sandbox, hooki.' },
  { slug: 'szkolenie-git',            title: 'Claude Code i Git',            desc: 'Automatyczne commity i git workflow prowadzone przez agenta.' },
  { slug: 'szkolenie-supabase-mcp',   title: 'MCP Supabase',                 desc: 'Połączenie agenta z bazą Supabase — tryb read-only i bezpieczeństwo.' },  { slug: 'szkolenie-mysql',          title: 'MySQL MCP Server',             desc: 'Agent na bazie MySQL: konfiguracja, operacje zapisu, pułapki wersji.' },
  { slug: 'serwery-mcp',              title: 'Serwery MCP',                  desc: 'Chrome DevTools MCP i ekosystem serwerów MCP w codziennej pracy.' },
  { slug: 'tips-and-tricks',          title: 'Tips & Tricks',                desc: 'Praktyki, skróty i wzorce, które realnie przyspieszają pracę z AI.' },
  { slug: 'ai-dla-handlowcow',        title: 'AI dla handlowców',            desc: 'Warsztat pracy handlowca: szablony promptów, higiena notatników, plan 30 dni.' },
  { slug: 'petle',                    title: 'Pętle (/goal, /loop)',         desc: 'Agent pracuje, aż cel osiągnięty — checklista odhaczana automatycznie.' },
  { slug: 'gemini-cli',               title: 'Gemini CLI',                   desc: 'Google Gemini w terminalu — kiedy i jak używać obok Claude Code.' },
  { slug: 'codex-cli',                title: 'OpenAI Codex CLI',             desc: 'Codex CLI w workflow agentowym — mocne strony i ograniczenia.' },
  { slug: 'lm-studio',                title: 'LM Studio',                    desc: 'Lokalne modele LLM przez LM Studio — prywatność i offline.' },
  // gate: false — realną bramką jest login przy pobraniu ZIP; page-gate chował tylko CTA
  { slug: 'stm32-skill',              title: 'Skill STM32 dla Claude Code', desc: 'Konfigurator skilla embedded: build Keil, flash ST-Link, debug SWO — pod Twoją płytkę.', gate: false },
  { slug: 'llama-server',             title: 'Lokalny LLM (llama-server)',   desc: 'Własny serwer modeli na infrastrukturze firmy.' },
];
