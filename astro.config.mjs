// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import rehypeBaseLinks from './src/lib/rehype-base-links.mjs';
import rehypeGameHooks from './src/lib/rehype-game-hooks.mjs';
import { phraseHooks } from './src/chaos/hooks.mjs';
import solbeeIndex from './src/lib/solbee-index.mjs';

const base = '/sbr-reloaded';

export default defineConfig({
  site: 'https://maxtkc.github.io',
  base,
  trailingSlash: 'ignore',
  integrations: [solbeeIndex()],
  vite: {
    // Pre-bundle deps that are only reached through dynamic imports, so dev does not re-optimize mid-session.
    optimizeDeps: { include: ['matter-js', 'kaplay', 'three'] },
  },
  markdown: {
    processor: unified({
      rehypePlugins: [
        [rehypeBaseLinks, { base }],
        [rehypeGameHooks, { hooks: phraseHooks }],
      ],
    }),
  },
});
