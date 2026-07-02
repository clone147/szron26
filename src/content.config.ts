import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Blog — wpisy przeniesione ze starej strony (public.szron_blog_posts w Supabase);
// nowe wpisy dodajemy jako pliki .md w src/content/blog/.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    excerpt: z.string().default(''),
    category: z.string().default('blog'),
    tags: z.array(z.string()).default([]),
    author: z.string().default('Tomek Wojciechowski'),
    publishedAt: z.coerce.date(),
  }),
});

export const collections = { blog };
