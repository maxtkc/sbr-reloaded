// Daily puzzle core shared with the page: London date, seeded picks, and the score store.

const TZ = 'Europe/London';
const EPOCH = Date.UTC(2026, 0, 1);

// Today's date in London as YYYY-MM-DD.
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

export function dayNumber(date = today()): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
}

// FNV-1a string hash.
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 generator in [0, 1).
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Today's item: a fixed shuffle of the pool walked one step per day, so nothing repeats until it wraps.
export function daily<T>(pool: readonly T[], salt: string, date = today()): T {
  const order = shuffled(pool, hash(salt));
  const n = dayNumber(date);
  return order[((n % order.length) + order.length) % order.length];
}

export interface DayResult {
  solved: boolean;
  // Shown in the footer list, e.g. "4/6" or "1:23".
  score: string;
  attempts: number;
  // Puzzle-specific progress kept for the rest of the day.
  state?: unknown;
}

type Store = Record<string, Record<string, DayResult>>;
const KEY = 'sbr-daily';

export function loadStore(): Store {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Store) : {};
  } catch {
    return {};
  }
}

// In-memory copy so puzzles still work for the page view when storage is blocked.
let memory: Store | null = null;

function store(): Store {
  return (memory ??= loadStore());
}

export function getDay(slug: string, date = today()): DayResult | undefined {
  return store()[slug]?.[date];
}

export function setDay(slug: string, result: DayResult, date = today()): void {
  const s = store();
  (s[slug] ??= {})[date] = result;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the result lasts for this page view.
  }
  dispatchEvent(new CustomEvent('sbr-daily', { detail: slug }));
}

// Consecutive solved days ending today, or yesterday if today is not solved yet.
export function streak(slug: string, s: Store = store()): number {
  const days = s[slug] ?? {};
  let n = dayNumber();
  if (!days[dateOf(n)]?.solved) n--;
  let count = 0;
  while (days[dateOf(n)]?.solved) {
    count++;
    n--;
  }
  return count;
}

export function stats(slug: string, s: Store = store()): { played: number; solved: number } {
  const days = Object.values(s[slug] ?? {});
  return { played: days.length, solved: days.filter((d) => d.solved).length };
}

function dateOf(n: number): string {
  return new Date(EPOCH + n * 86400000).toISOString().slice(0, 10);
}
