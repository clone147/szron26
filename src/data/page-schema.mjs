// Per-stronowe schematy JSON-LD. Organization + WebSite są site-wide w Base.astro;
// tu generujemy schemat zależny od typu strony + BreadcrumbList. FAQPage celowo
// pominięty (rich results FAQ ograniczone do stron rządowych/zdrowotnych od 2023).

const PUBLISHED = '2026-06-14';

// Akademia — TechArticle (przewodniki techniczne)
const ACADEMY = new Set([
  'claude-code', 'claude-code-bezpieczenstwo', 'szkolenie-git',
  'szkolenie-supabase-mcp', 'szkolenie-mysql', 'serwery-mcp', 'tips-and-tricks',
  'gemini-cli', 'codex-cli', 'lm-studio', 'llama-server', 'petle',
]);
// Usługi — Service
const SERVICES = {
  'doradztwo-technologiczne': 'Doradztwo technologiczne',
  'wdrozenia-ai': 'Wdrożenia AI',
  'transformacja-ai': 'Transformacja AI',
  'transformacja-ai-dla-programistow': 'Transformacja AI dla programistów',
  'augmentacja-pracownikow': 'Augmentacja zespołu AI',
  'ai-dla-dev-teamow': 'AI dla zespołów software',
  'ai-dla-embedded': 'AI dla embedded',
  'ai-dla-przemyslu': 'Modernizacja systemów przemysłowych',
  'ai-sektor-regulowany': 'AI dla sektora regulowanego',
  'ai-pilot-procesu': 'Pilot AI w procesie',
  'dla-zespolow': 'Wdrożenie AI w zespole',
  'mobile-apps': 'Aplikacje mobilne',
  'ai-act-compliance': 'Zgodność z AI Act',
  'darmowy-audyt': 'Darmowy audyt AI',
  'metoda': 'Metoda wdrożenia AI',
};
// Case studies — Article
const CASE_STUDIES = new Set(['case-studies/stm32', 'case-studies/hmi', 'case-studies/regiobus']);
const COMPARISON = new Set(['outsourcing-vs-inhouse-ai']); // Article
const CONTACT = new Set(['kontakt', 'umow-rozmowe']);

export function pageSchema(pathname, ctx) {
  const { title, description, heading, image, canonical, site, dateModified } = ctx;
  const modified = dateModified || PUBLISHED; // per-page data aktualizacji, fallback do globalnej daty publikacji
  const slug = pathname.replace(/^\/|\/$/g, ''); // bez wiodących/końcowych /
  if (!slug) return []; // homepage — tylko Organization+WebSite z Base
  const url = (p) => new URL(p, site).href;
  const orgRef = { '@id': url('/#org') };

  const out = [];

  // 1) BreadcrumbList — zawsze (Home → [Akademia] → strona)
  const crumbs = [{ '@type': 'ListItem', position: 1, name: 'Strona główna', item: url('/') }];
  let pos = 2;
  const underAkademia = ACADEMY.has(slug) || slug === 'akademia';
  if (ACADEMY.has(slug)) {
    crumbs.push({ '@type': 'ListItem', position: pos++, name: 'Akademia', item: url('/akademia') });
  } else if (slug.startsWith('case-studies/')) {
    crumbs.push({ '@type': 'ListItem', position: pos++, name: 'Case studies', item: url('/case-studies') });
  }
  crumbs.push({ '@type': 'ListItem', position: pos, name: heading || title, item: canonical });
  out.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs });

  // 2) Schemat główny wg typu
  const base = { '@context': 'https://schema.org', mainEntityOfPage: canonical, url: canonical,
                 name: title, description, inLanguage: 'pl-PL', publisher: orgRef };

  if (ACADEMY.has(slug)) {
    out.push({ ...base, '@type': 'TechArticle', headline: heading || title,
      image: image || url('/img/og-cover.webp'),
      datePublished: PUBLISHED, dateModified: modified,
      author: { '@type': 'Organization', ...orgRef, name: 'SZRON' },
      about: 'Programowanie agentowe, Claude Code, MCP, lokalne modele LLM' });
  } else if (CASE_STUDIES.has(slug) || COMPARISON.has(slug)) {
    out.push({ ...base, '@type': 'Article', headline: heading || title,
      image: image || url('/img/og-cover.webp'),
      datePublished: PUBLISHED, dateModified: modified,
      author: { '@type': 'Organization', ...orgRef, name: 'SZRON' } });
  } else if (slug === 'devlens') {
    out.push({ '@context': 'https://schema.org', '@type': 'SoftwareApplication',
      name: 'DevLens', applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
      description, url: canonical, image: image || url('/img/og-cover.webp'),
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'PLN', availability: 'https://schema.org/InStock' },
      publisher: orgRef });
  } else if (SERVICES[slug]) {
    out.push({ '@context': 'https://schema.org', '@type': 'Service',
      name: SERVICES[slug], serviceType: SERVICES[slug], description,
      provider: { '@type': 'Organization', ...orgRef, name: 'SZRON' },
      areaServed: { '@type': 'Country', name: 'Polska' }, url: canonical });
  } else if (slug === 'o-nas') {
    out.push({ '@context': 'https://schema.org', '@type': 'AboutPage', url: canonical, name: title,
      mainEntity: orgRef });
    out.push({ '@context': 'https://schema.org', '@type': 'Person', name: 'Tomek Wojciechowski',
      jobTitle: 'Założyciel · AI workflow i strategia', worksFor: orgRef, url: canonical });
    out.push({ '@context': 'https://schema.org', '@type': 'Person', name: 'Maciej Stopa',
      jobTitle: 'Senior Full-stack / Mobile', worksFor: orgRef, url: canonical });
  } else if (CONTACT.has(slug)) {
    out.push({ ...base, '@type': 'ContactPage' });
  } else if (slug === 'akademia' || slug === 'case-studies' || slug === 'aktualnosci' || slug === 'zasoby' || slug === 'blog' || slug === 'open-source') {
    out.push({ ...base, '@type': 'CollectionPage' });
  } else {
    out.push({ ...base, '@type': 'WebPage' });
  }
  return out;
}
