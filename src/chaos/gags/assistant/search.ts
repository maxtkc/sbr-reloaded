// Site search for manager mode: MiniLM similarity against the build-time index, boosted by keyword overlap.
import { loadEmbedder } from './match';

interface Index {
  dims: number;
  chunks: { u: string; t: string; x: string; h?: string }[];
  vectors: string | null;
}

export interface Hit {
  url: string;
  title: string;
  text: string;
  link?: string;
  score: number;
}

// Combined score needed to count as an answer, with and without embeddings.
const THRESHOLD = 0.32;
const LEXICAL_THRESHOLD = 0.4;
const LEXICAL_WEIGHT = 0.3;

const STOP = new Set(
  (
    'a an and are as at be but by can do does for from get got how i if in is it its me my of on or ' +
    'so that the there this to was we what when where which who why will with you your about any ' +
    'have has im not no should would could tell know need want please'
  ).split(' '),
);

// Lowercase word stems: hyphens and apostrophes removed ("Wi-Fi" -> "wifi"), plural s dropped.
function terms(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/['’-]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

interface Doc {
  hit: Omit<Hit, 'score'>;
  title: Set<string>;
  body: Set<string>;
}

// Fraction of the query's terms found in a chunk, weighted by rarity; title matches count double.
function lexical(query: string[], doc: Doc, idf: Map<string, number>): number {
  let got = 0;
  let max = 0;
  for (const q of new Set(query)) {
    const w = idf.get(q) ?? Math.log(1 + idf.size);
    max += 2 * w;
    if (doc.title.has(q)) got += 2 * w;
    else if (doc.body.has(q)) got += w;
  }
  return max ? got / max : 0;
}

function decode(b64: string): Int8Array {
  const bin = atob(b64);
  const out = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface SiteSearch {
  // Starts fetching the index and model early, e.g. while the user is on hold.
  preload: () => void;
  search: (query: string, k?: number) => Promise<Hit[]>;
}

export function siteSearch(indexUrl: string): SiteSearch {
  let loaded:
    | Promise<{ docs: Doc[]; idf: Map<string, number>; vecs: Int8Array | null; dims: number }>
    | undefined;
  let embedFailed = false;

  const load = () =>
    (loaded ??= fetch(indexUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`index ${r.status}`);
        return r.json() as Promise<Index>;
      })
      .then((index) => {
        const docs = index.chunks.map((c) => ({
          hit: { url: c.u, title: c.t, text: c.x, link: c.h },
          title: new Set(terms(c.t)),
          body: new Set(terms(c.x)),
        }));
        const df = new Map<string, number>();
        for (const d of docs)
          for (const t of new Set([...d.title, ...d.body])) df.set(t, (df.get(t) ?? 0) + 1);
        const idf = new Map([...df].map(([t, n]) => [t, Math.log(1 + docs.length / n)]));
        return { docs, idf, vecs: index.vectors ? decode(index.vectors) : null, dims: index.dims };
      })
      .catch((err) => {
        // Retry on the next question.
        loaded = undefined;
        throw err;
      }));

  const preload = () => {
    load().catch(() => {});
    loadEmbedder().catch(() => {});
  };

  async function search(query: string, k = 3): Promise<Hit[]> {
    const { docs, idf, vecs, dims } = await load();
    const q = terms(query);
    let qv: Float32Array | null = null;
    if (vecs && !embedFailed) {
      try {
        [qv] = await (await loadEmbedder())([query]);
      } catch (err) {
        console.error('assistant site search embedding failed, using keywords', err);
        embedFailed = true;
      }
    }
    const scored = docs.map((doc, i) => {
      const lex = lexical(q, doc, idf);
      if (!qv || !vecs) return { ...doc.hit, score: lex, pass: lex >= LEXICAL_THRESHOLD };
      let dot = 0;
      for (let d = 0; d < dims; d++) dot += qv[d] * vecs[i * dims + d];
      const score = dot / 127 + LEXICAL_WEIGHT * lex;
      return { ...doc.hit, score, pass: score >= THRESHOLD };
    });
    return scored
      .filter((s) => s.pass)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ pass: _, ...hit }) => hit);
  }

  return { preload, search };
}
