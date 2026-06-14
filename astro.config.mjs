// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Statyczna witryna SZRON. Wyjście do dist/ → publikacja na Netlify.
// `site` = docelowa domena kanoniczna (canonical, og:url, sitemap). Po przepięciu
// domeny ze starego szron.tech działają w pełni; do tego czasu wskazują cel.
export default defineConfig({
  site: 'https://szron.tech',
  build: { format: 'directory' },
  integrations: [sitemap({ filter: (page) => !page.includes('/strefa') })],
});
