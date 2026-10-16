// Intent matchers for Solbee: keyword hits (instant) or MiniLM sentence embeddings (lazy-loaded model).
import { DTYPE, MODEL } from '../../../lib/solbee-model.mjs';

export interface Intent {
  id: string;
  keywords: string[];
  examples: string[];
  replies: string[];
}

// Returns the matched intent, or null for a fallback reply.
export type Matcher = (message: string) => Promise<Intent | null>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Keywords of 5+ characters match word prefixes ("stress" hits "stressed"); shorter ones match whole words only.
export function keywordMatcher(intents: Intent[]): Matcher {
  const compiled = intents.map((intent) => ({
    intent,
    patterns: intent.keywords.map(
      (k) => new RegExp(`\\b${escape(k.toLowerCase())}${k.length >= 5 ? '' : '\\b'}`),
    ),
  }));
  return async (message) => {
    const text = message.toLowerCase();
    let best: Intent[] = [];
    let bestScore = 0;
    for (const { intent, patterns } of compiled) {
      const score = patterns.filter((p) => p.test(text)).length;
      if (score > bestScore) {
        best = [intent];
        bestScore = score;
      } else if (score > 0 && score === bestScore) best.push(intent);
    }
    return best.length ? best[Math.floor(Math.random() * best.length)] : null;
  };
}

// Minimum cosine similarity to count as a match.
const THRESHOLD = 0.35;

export type Embed = (texts: string[]) => Promise<Float32Array[]>;

// Loads the feature-extraction pipeline once. Model files are cached by the library in the browser Cache API.
let embedder: Promise<Embed> | undefined;
export function loadEmbedder(): Promise<Embed> {
  embedder ??= import('@huggingface/transformers').then(async ({ pipeline }) => {
    const extract = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
    return async (texts) => {
      const out = await extract(texts, { pooling: 'mean', normalize: true });
      const [n, dim] = out.dims;
      const data = out.data as Float32Array;
      return Array.from({ length: n }, (_, i) => data.subarray(i * dim, (i + 1) * dim));
    };
  });
  return embedder;
}

const dot = (a: Float32Array, b: Float32Array) => a.reduce((sum, v, i) => sum + v * b[i], 0);

// Embeds every intent example on first use; falls back to keywords if the model cannot load.
export function embeddingMatcher(intents: Intent[]): Matcher {
  const fallback = keywordMatcher(intents);
  let index: Promise<{ intent: Intent; vec: Float32Array }[]> | undefined;
  let failed = false;
  return async (message) => {
    if (failed) return fallback(message);
    try {
      index ??= loadEmbedder().then(async (embed) => {
        const rows = intents.flatMap((intent) => intent.examples.map((ex) => ({ intent, ex })));
        const vecs = await embed(rows.map((r) => r.ex));
        return rows.map((r, i) => ({ intent: r.intent, vec: vecs[i] }));
      });
      const [examples, [query]] = await Promise.all([
        index,
        loadEmbedder().then((e) => e([message])),
      ]);
      let best: Intent | null = null;
      let bestScore = THRESHOLD;
      for (const { intent, vec } of examples) {
        const score = dot(query, vec);
        if (score > bestScore) {
          best = intent;
          bestScore = score;
        }
      }
      return best;
    } catch (err) {
      console.error('assistant embedding matcher failed, using keywords', err);
      failed = true;
      return fallback(message);
    }
  };
}
