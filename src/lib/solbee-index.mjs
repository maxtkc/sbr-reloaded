// Astro integration: chunks the text of every page and embeds it with MiniLM as solbee-index.json.
// Written to dist after build; served from a crawl of the site's own pages in dev.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromHtml } from 'hast-util-from-html';
import { DTYPE, MODEL } from './solbee-model.mjs';

const SKIP = new Set([
  'head',
  'header',
  'nav',
  'script',
  'style',
  'template',
  'dialog',
  'svg',
  'button',
  'form',
  'noscript',
]);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4']);
const BLOCKS = new Set(['p', 'li', 'dd', 'td', 'th', 'blockquote', 'figcaption', 'h5', 'h6', 'dl']);
const MAX_WORDS = 120;
// Shorter chunks are titles and labels, which match too many queries.
const MIN_WORDS = 6;

const clean = (s) => s.replace(/\s+/g, ' ').trim();

function text(node) {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element' || SKIP.has(node.tagName)) return '';
  if (node.tagName === 'br') return ' ';
  const inner = node.children.map(text).join('');
  if (node.tagName === 'dt') return ` ${clean(inner)}: `;
  if (node.tagName === 'dd' || node.tagName === 'li' || node.tagName === 'p') return ` ${inner} `;
  return inner;
}

const hasBlock = (node) =>
  node.children?.some((c) => c.type === 'element' && (BLOCKS.has(c.tagName) || hasBlock(c)));

// Single link that makes up most of a block's text, e.g. a quick link.
function mainLink(node, t) {
  let found = null;
  const walk = (n) => {
    if (found || n.type !== 'element') return;
    if (n.tagName === 'a' && n.properties?.href) {
      if (clean(text(n)).length * 2 >= t.length) found = String(n.properties.href);
      return;
    }
    n.children.forEach(walk);
  };
  walk(node);
  return found;
}

// Collects { id, heading, text, href } blocks in document order. Footer content is limited to <address>.
// A block's anchor is the innermost id: an ancestor element's, or the id of the heading it sits under.
function blocks(tree) {
  const out = [];
  const walk = (node, ctx) => {
    if (node.type !== 'element' && node.type !== 'root') return;
    if (node.type === 'element') {
      if (SKIP.has(node.tagName)) return;
      if (node.tagName === 'footer') {
        if (!ctx.footer) node.children.forEach((c) => walk(c, { ...ctx, footer: true }));
        return;
      }
      if (node.tagName === 'address') ctx = { ...ctx, footer: false };
      const depth = ctx.depth + 1;
      ctx = { ...ctx, depth };
      if (node.properties?.id) ctx = { ...ctx, id: String(node.properties.id), idDepth: depth };
      if (HEADINGS.has(node.tagName)) {
        ctx.section.heading = clean(text(node));
        if (node.properties?.id) Object.assign(ctx.section, { id: ctx.id, idDepth: depth });
        return;
      }
      if (BLOCKS.has(node.tagName) && !(node.tagName !== 'dl' && hasBlock(node))) {
        const t = clean(text(node));
        const id = ctx.section.idDepth > ctx.idDepth ? ctx.section.id : ctx.id;
        if (t && !ctx.footer)
          out.push({ id, heading: ctx.section.heading, text: t, href: mainLink(node, t) });
        return;
      }
    }
    // Headings inside a container apply until the container ends.
    const section = { ...ctx.section };
    node.children.forEach((c) => walk(c, { ...ctx, section }));
  };
  walk(tree, {
    id: '',
    idDepth: 0,
    depth: 0,
    footer: false,
    section: { heading: '', id: '', idDepth: -1 },
  });
  return out;
}

function sentences(t) {
  return (
    t
      .match(/[^.!?]+[.!?]*(\s+|$)/g)
      ?.map(clean)
      .filter(Boolean) ?? [t]
  );
}

// Groups consecutive blocks with the same anchor and heading into chunks of at most MAX_WORDS words.
// Link blocks stay on their own so the chunk can carry the link.
function chunk(list) {
  const chunks = [];
  let cur = null;
  const words = (s) => s.split(' ').length;
  const push = (b, t) => {
    if (
      cur &&
      !cur.href &&
      !b.href &&
      cur.id === b.id &&
      cur.heading === b.heading &&
      words(cur.text) + words(t) <= MAX_WORDS
    ) {
      cur.text += ' ' + t;
    } else {
      cur = { id: b.id, heading: b.heading, text: t, href: b.href };
      chunks.push(cur);
    }
  };
  for (const b of list) {
    if (words(b.text) <= MAX_WORDS) push(b, b.text);
    else sentences(b.text).forEach((s) => push(b, s));
  }
  return chunks;
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => join(e.parentPath, e.name));
}

function pagePath(dist, file, base) {
  const rel = relative(dist, file)
    .split(sep)
    .join('/')
    .replace(/(^|\/)index\.html$/, '$1');
  return `${base.replace(/\/$/, '')}/${rel}`;
}

// Embeds texts as normalized int8 vectors (value * 127), base64-encoded in one buffer.
async function embed(texts) {
  const { pipeline } = await import('@huggingface/transformers');
  const extract = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
  const dims = 384;
  const buf = new Int8Array(texts.length * dims);
  for (let i = 0; i < texts.length; i += 32) {
    const out = await extract(texts.slice(i, i + 32), { pooling: 'mean', normalize: true });
    const data = out.data;
    for (let j = 0; j < data.length; j++)
      buf[i * dims + j] = Math.round(Math.max(-1, Math.min(1, data[j])) * 127);
  }
  return { dims, vectors: Buffer.from(buf.buffer).toString('base64') };
}

// Same-site page paths linked from a page, without hash or query. Skips games, the CMS, Astro internals (/_image)
// and non-HTML files.
function pageLinks(tree, base) {
  const out = [];
  const walk = (node) => {
    if (
      node.type === 'element' &&
      node.tagName === 'a' &&
      typeof node.properties?.href === 'string'
    ) {
      const path = node.properties.href.split(/[?#]/)[0];
      if (path.startsWith(base) && !skipPath(path) && !/\.\w+$/.test(path)) out.push(path);
    }
    node.children?.forEach(walk);
  };
  walk(tree);
  return out;
}

const skipPath = (path) => /\/(games|admin)(\/|$)|\/_/.test(path) || path.endsWith('404.html');

// Chunks and embeds pages given as { path, tree }. Shorter paths win duplicate text, so shared content
// (footer, quick links strip) is attributed to the home page.
async function indexPages(pages, log) {
  pages.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
  const seen = new Set();
  const chunks = [];
  for (const { path, tree } of pages) {
    for (const c of chunk(blocks(tree))) {
      if ((!c.href && c.text.split(' ').length < MIN_WORDS) || seen.has(c.text)) continue;
      seen.add(c.text);
      const row = { u: c.id ? `${path}#${c.id}` : path, t: c.heading, x: c.text };
      if (c.href) row.h = c.href;
      chunks.push(row);
    }
  }

  let vectors = null;
  let dims = 0;
  try {
    ({ dims, vectors } = await embed(chunks.map((c) => (c.t ? `${c.t}. ${c.x}` : c.x))));
  } catch (err) {
    log.warn(`embedding failed, writing text only (${err.message})`);
  }
  log.info(`${chunks.length} chunks from ${pages.length} pages`);
  return { model: MODEL, dtype: DTYPE, dims, chunks, vectors };
}

export async function buildIndex(dist, base, log = console) {
  const pages = [];
  for (const file of await htmlFiles(dist)) {
    const path = pagePath(dist, file, base);
    if (!skipPath(path)) pages.push({ path, tree: fromHtml(await readFile(file, 'utf8')) });
  }
  const index = await indexPages(pages, log);
  await writeFile(join(dist, 'solbee-index.json'), JSON.stringify(index));
}

// Dev server: crawls the site's own pages from the home page, following internal links.
async function crawlIndex(origin, base, log) {
  const home = `${base.replace(/\/$/, '')}/`;
  const queue = [home];
  const done = new Set();
  const pages = [];
  while (queue.length && done.size < 200) {
    const path = queue.shift();
    const key = path.replace(/\/$/, '');
    if (done.has(key)) continue;
    done.add(key);
    const res = await fetch(origin + path, { headers: { accept: 'text/html' } });
    if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) continue;
    const tree = fromHtml(await res.text());
    pages.push({ path, tree });
    queue.push(...pageLinks(tree, home));
  }
  return indexPages(pages, log);
}

export default function solbeeIndex() {
  let base = '/';
  return {
    name: 'solbee-index',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base;
      },
      'astro:server:setup': ({ server, logger }) => {
        // Vite may already have stripped the base from req.url.
        const routes = ['/solbee-index.json', `${base.replace(/\/$/, '')}/solbee-index.json`];
        let cached;
        // Rebuilt on the next request after any source change.
        server.watcher.on('change', () => (cached = undefined));
        server.middlewares.use((req, res, next) => {
          if (!routes.includes(req.url?.split('?')[0] ?? '')) return next();
          cached ??= crawlIndex(`http://${req.headers.host}`, base, logger);
          cached
            .then((index) => {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify(index));
            })
            .catch((err) => {
              cached = undefined;
              logger.error(`index failed: ${err.message}`);
              res.statusCode = 500;
              res.end();
            });
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        await buildIndex(fileURLToPath(dir), base, logger);
      },
    },
  };
}
