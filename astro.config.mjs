// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import rehypeBaseLinks from './src/lib/rehype-base-links.mjs';
import rehypeGameHooks from './src/lib/rehype-game-hooks.mjs';
import rehypeTaskLabels from './src/lib/rehype-task-labels.mjs';
import { phraseHooks } from './src/chaos/hooks.mjs';
import solbeeIndex from './src/lib/solbee-index.mjs';

const base = '/';

export default defineConfig({
  site: 'https://sjcsbr.com',
  base,
  trailingSlash: 'ignore',
  // Inline the small page CSS so first paint does not wait on stylesheet requests.
  build: { inlineStylesheets: 'always' },
  integrations: [
    solbeeIndex(),
    sitemap({ filter: (page) => !/\/(games|admin)\//.test(new URL(page).pathname) }),
  ],
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Cormorant Garamond',
      cssVariable: '--font-serif',
      weights: [600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'Times New Roman', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Source Sans 3',
      cssVariable: '--font-sans',
      weights: [400, 600],
      styles: ['normal', 'italic'],
      subsets: ['latin'],
      fallbacks: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
    },
  ],
  vite: {
    // Pre-bundle deps that are only reached through dynamic imports, so dev does not re-optimize mid-session.
    optimizeDeps: { include: ['matter-js', 'kaplay', 'three'] },
  },
  markdown: {
    processor: unified({
      rehypePlugins: [
        [rehypeBaseLinks, { base }],
        [rehypeGameHooks, { hooks: phraseHooks }],
        rehypeTaskLabels,
      ],
    }),
  },
});
