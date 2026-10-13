// Rewrites src/content YAML and markdown frontmatter in the same style Sveltia CMS saves.
// Usage: node scripts/format-content.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { toYaml, toFrontmatter } from './lib/yaml-format.mjs';

const root = 'src/content';
let changed = 0;
for (const dir of readdirSync(root)) {
  for (const name of readdirSync(join(root, dir))) {
    const path = join(root, dir, name);
    const src = readFileSync(path, 'utf8');
    let out;
    if (name.endsWith('.yaml')) {
      out = `${toYaml(parse(src))}\n`;
    } else if (name.endsWith('.md')) {
      const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!m) continue;
      out = toFrontmatter(parse(m[1]), m[2]);
    } else continue;
    if (out !== src) {
      writeFileSync(path, out);
      changed++;
    }
  }
}
console.log(`Reformatted ${changed} file(s)`);
