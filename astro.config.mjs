// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import rehypeBaseLinks from './src/lib/rehype-base-links.mjs';
import rehypeGameHooks from './src/lib/rehype-game-hooks.mjs';
import { phraseHooks } from './src/chaos/hooks.mjs';

const base = '/sbr-reloaded';

export default defineConfig({
  site: 'https://maxtkc.github.io',
  base,
  trailingSlash: 'ignore',
  markdown: {
    processor: unified({
      rehypePlugins: [
        [rehypeBaseLinks, { base }],
        [rehypeGameHooks, { hooks: phraseHooks }],
      ],
    }),
  },
});
