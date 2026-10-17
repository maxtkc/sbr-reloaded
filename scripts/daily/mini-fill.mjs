// Authoring helper: prints 5x5 mini crossword fills with a given word in a given row.
// Pattern: black top-left and bottom-right corners. Words come from common SCOWL levels.
// Usage: node scripts/daily/mini-fill.mjs PUNTS [row=2] [count=5]
import { readFileSync } from 'node:fs';

const [seed = '', rowArg = '2', countArg = '5'] = process.argv.slice(2);
const SEED = seed.toUpperCase();
const ROW = Number(rowArg);
const COUNT = Number(countArg);

const dir = new URL('../../node_modules/wordlist-english/', import.meta.url);
const load = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const words = new Set(
  [
    'english-words-10',
    'english-words-20',
    'english-words-35',
    'british-words-10',
    'british-words-20',
  ]
    .flatMap((f) => load(`${f}.json`))
    .filter((w) => /^[a-z]{4,5}$/.test(w))
    .map((w) => w.toUpperCase()),
);
words.add(SEED);
const byLen = {
  4: [...words].filter((w) => w.length === 4),
  5: [...words].filter((w) => w.length === 5),
};
const prefixes = new Set();
for (const w of words)
  for (let i = 1; i <= w.length; i++) prefixes.add(`${w.length}:${w.slice(0, i)}`);

// Black cells at (0,0) and (4,4).
const black = (r, c) => (r === 0 && c === 0) || (r === 4 && c === 4);
const rows = [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].filter((c) => !black(r, c)));
const cols = [0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].filter((r) => !black(r, c)));

const grid = [0, 1, 2, 3, 4].map(() => Array(5).fill(''));
const used = new Set();
let found = 0;

function colsOk() {
  for (let c = 0; c < 5; c++) {
    let s = '';
    for (const r of cols[c]) {
      if (!grid[r][c]) break;
      s += grid[r][c];
    }
    if (s && !prefixes.has(`${cols[c].length}:${s}`)) return false;
  }
  return true;
}

function place(r, word) {
  rows[r].forEach((c, i) => (grid[r][c] = word ? word[i] : ''));
}

function fill(r) {
  if (found >= COUNT) return;
  if (r === 5) {
    const downs = cols.map((rs, c) => rs.map((rr) => grid[rr][c]).join(''));
    if (downs.some((d) => !words.has(d) || used.has(d))) return;
    found++;
    console.log(
      grid.map((row, i) => row.map((ch, c) => (black(i, c) ? '#' : ch)).join('')).join(' '),
    );
    console.log(
      '  across:',
      rows.map((rs, i) => rs.map((c) => grid[i][c]).join('')).join(' '),
      ' down:',
      downs.join(' '),
    );
    return;
  }
  const opts = r === ROW ? [SEED] : byLen[rows[r].length].slice().sort(() => Math.random() - 0.5);
  for (const w of opts) {
    if (used.has(w)) continue;
    place(r, w);
    used.add(w);
    if (colsOk()) fill(r + 1);
    used.delete(w);
    place(r, '');
    if (found >= COUNT) return;
  }
}

fill(0);
if (!found) console.log('no fill found');
