// @ts-check
import { defineConfig } from 'astro/config';

// Statyczna witryna SZRON. Wyjście do dist/ → publikacja na Netlify.
export default defineConfig({
  site: 'https://szron.tech',
  build: { format: 'directory' },
});
