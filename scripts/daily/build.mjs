// Builds data for the daily puzzles and validates src/games/daily/data.json.
// Writes src/games/daily/words.json (Wordle guesses, Spelling Bee puzzles) and src/games/daily/countries.json.
// Usage: node scripts/daily/build.mjs [--cached]   (--cached reuses scripts/daily/out/countries.geojson)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const OUT_DIR = new URL('./out/', import.meta.url);
const GEOJSON = new URL('countries.geojson', OUT_DIR);
const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const DAILY = new URL('../../src/games/daily/', import.meta.url);
const WORDLIST = new URL('../../node_modules/wordlist-english/', import.meta.url);

const data = JSON.parse(readFileSync(new URL('data.json', DAILY), 'utf8'));
const errors = [];
const fail = (msg) => errors.push(msg);

const loadWords = (files) =>
  files.flatMap((f) => JSON.parse(readFileSync(new URL(`${f}.json`, WORDLIST), 'utf8')));
// SCOWL files are per level, so a vocabulary up to level N is the union of levels <= N.
const levels = (lang, upTo) =>
  [10, 20, 35, 40, 50, 55, 60].filter((n) => n <= upTo).map((n) => `${lang}-words-${n}`);
const existing = (names) => names.filter((n) => existsSync(new URL(`${n}.json`, WORDLIST)));

// Wordle: every lowercase 5-letter word up to SCOWL 60 (british up to 55), plus the answers.
const answers = data.wordle.answers;
for (const a of answers) if (!/^[A-Z]{5}$/.test(a)) fail(`wordle answer not 5 letters: ${a}`);
if (new Set(answers).size !== answers.length) fail('wordle answers repeat');
const guessWords = new Set(
  loadWords(existing([...levels('english', 60), ...levels('british', 55)]))
    .filter((w) => /^[a-z]{5}$/.test(w))
    .map((w) => w.toUpperCase()),
);
for (const a of answers) guessWords.add(a);

// Connections: 4 tiles per group, every tile unique across all groups, at least 4 groups per level.
const tiles = new Map();
data.connections.groups.forEach((level, li) => {
  if (level.length < 4) fail(`connections level ${li} has fewer than 4 groups`);
  for (const g of level) {
    if (g.words.length !== 4) fail(`connections group "${g.name}" needs 4 words`);
    for (const w of g.words) {
      if (tiles.has(w)) fail(`connections tile "${w}" in "${g.name}" and "${tiles.get(w)}"`);
      tiles.set(w, g.name);
    }
  }
});
if (data.connections.groups.length !== 4) fail('connections needs 4 levels');

// Mini: 5x5 grids, clue counts match the numbered entries.
function miniEntries(grid) {
  const at = (r, c) => (r >= 0 && r < 5 && c >= 0 && c < 5 ? grid[r][c] : '#');
  const across = [];
  const down = [];
  let n = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      if (at(r, c) === '#') continue;
      const a = at(r, c - 1) === '#' && at(r, c + 1) !== '#';
      const d = at(r - 1, c) === '#' && at(r + 1, c) !== '#';
      if (!a && !d) continue;
      n++;
      const read = (dr, dc) => {
        let s = '';
        for (let i = 0; at(r + dr * i, c + dc * i) !== '#'; i++) s += at(r + dr * i, c + dc * i);
        return s;
      };
      if (a) across.push([n, read(0, 1)]);
      if (d) down.push([n, read(1, 0)]);
    }
  return { across, down };
}
data.mini.forEach((m, i) => {
  if (m.grid.length !== 5 || m.grid.some((row) => !/^[A-Z#]{5}$/.test(row))) {
    fail(`mini ${i}: grid must be 5 rows of 5 letters or #`);
    return;
  }
  const { across, down } = miniEntries(m.grid);
  if (across.length !== m.across.length)
    fail(`mini ${i}: ${across.length} across entries, ${m.across.length} clues`);
  if (down.length !== m.down.length)
    fail(`mini ${i}: ${down.length} down entries, ${m.down.length} clues`);
  if (process.argv.includes('--show-mini'))
    console.log(
      `mini ${i}\n` +
        across.map(([n, w], j) => `  ${n}A ${w}: ${m.across[j]}`).join('\n') +
        '\n' +
        down.map(([n, w], j) => `  ${n}D ${w}: ${m.down[j]}`).join('\n'),
    );
});

// Spelling Bee: each theme has exactly 7 distinct letters. Accepted words come from common SCOWL levels.
const beeWords = [
  ...new Set(
    loadWords(existing([...levels('english', 35), ...levels('british', 35)])).filter((w) =>
      /^[a-z]{4,}$/.test(w),
    ),
  ),
].map((w) => w.toUpperCase());
// Words a family-friendly puzzle should not accept.
const BLOCK = new Set([
  'ANAL',
  'ANUS',
  'RAPE',
  'RAPED',
  'RAPES',
  'RAPIST',
  'NAZI',
  'NAZIS',
  'SLUT',
  'PORN',
  'CRAP',
  'TURD',
]);
const score = (w, letters) =>
  (w.length === 4 ? 1 : w.length) + (letters.every((l) => w.includes(l)) ? 7 : 0);
const bee = [];
for (const theme of data.bee.themes) {
  const letters = [...new Set(theme)];
  if (letters.length !== 7) {
    fail(`bee theme ${theme} has ${letters.length} distinct letters`);
    continue;
  }
  const pool = beeWords.filter((w) => !BLOCK.has(w) && [...w].every((ch) => letters.includes(ch)));
  if (!pool.includes(theme)) pool.push(theme);
  // Centre letter with a word count closest to 35, never S.
  let best = null;
  for (const centre of letters) {
    if (centre === 'S') continue;
    const words = pool.filter((w) => w.includes(centre)).sort();
    if (words.length < 15) continue;
    if (!best || Math.abs(words.length - 35) < Math.abs(best.words.length - 35))
      best = { centre, words };
  }
  if (!best) {
    fail(`bee theme ${theme}: no centre letter gives 15+ words`);
    continue;
  }
  const outer = letters.filter((l) => l !== best.centre);
  bee.push({
    theme,
    centre: best.centre,
    outer,
    words: best.words,
    max: best.words.reduce((s, w) => s + score(w, letters), 0),
  });
}

if (errors.length) {
  console.error(errors.map((e) => `error: ${e}`).join('\n'));
  process.exit(1);
}

writeFileSync(
  new URL('words.json', DAILY),
  JSON.stringify({ guesses: [...guessWords].sort().join(' '), bee }) + '\n',
);
console.log(`words.json: ${guessWords.size} guesses, ${bee.length} bee puzzles`);
for (const b of bee)
  console.log(`  ${b.theme} centre ${b.centre}: ${b.words.length} words, ${b.max} pts`);

// Countries: Natural Earth 110m, each projected around its label point and fitted to a 100x100 box.
mkdirSync(OUT_DIR, { recursive: true });
if (!process.argv.includes('--cached') || !existsSync(GEOJSON)) {
  const res = await fetch(NE_URL);
  if (!res.ok) throw new Error(`Natural Earth download failed: ${res.status}`);
  writeFileSync(GEOJSON, await res.text());
}
const ne = JSON.parse(readFileSync(GEOJSON, 'utf8'));
const SKIP = new Set([
  'Antarctica',
  'French Southern and Antarctic Lands',
  'Somaliland',
  'Turkish Republic of Northern Cyprus',
]);
const RENAME = {
  "People's Republic of China": 'China',
  'United States of America': 'United States',
};
// Guessable, but never the answer.
const NOT_ANSWERS = new Set([
  'Falkland Islands',
  'New Caledonia',
  'Puerto Rico',
  'Western Sahara',
  'Greenland',
]);

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
};

const countries = [];
for (const f of ne.features) {
  const p = f.properties;
  const name = RENAME[p.NAME_EN] ?? (p.NAME_EN || p.NAME);
  if (SKIP.has(name) || !f.geometry) continue;
  const lon0 = p.LABEL_X;
  const lat0 = p.LABEL_Y;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // Longitudes wrapped around the label point so countries over the antimeridian stay in one piece.
  let rings = polys.map((poly) =>
    poly[0].map(([lon, lat]) => {
      let d = lon - lon0;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return [d * k, -lat];
    }),
  );
  // Drop specks under 1% of the biggest part.
  const biggest = Math.max(...rings.map(ringArea));
  rings = rings.filter((r) => ringArea(r) >= biggest * 0.01);
  const xs = rings.flat().map((q) => q[0]);
  const ys = rings.flat().map((q) => q[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const s = 92 / Math.max(maxX - minX, maxY - minY);
  const ox = (100 - (maxX - minX) * s) / 2;
  const oy = (100 - (maxY - minY) * s) / 2;
  const path = rings
    .map(
      (r) =>
        'M' +
        r
          .map(
            ([x, y]) => `${((x - minX) * s + ox).toFixed(1)} ${((y - minY) * s + oy).toFixed(1)}`,
          )
          .join('L') +
        'Z',
    )
    .join('');
  countries.push({
    name,
    lat: +lat0.toFixed(2),
    lon: +lon0.toFixed(2),
    path,
    ...(NOT_ANSWERS.has(name) ? { answer: false } : {}),
  });
}
countries.sort((a, b) => a.name.localeCompare(b.name));
for (const n of data.worldle.featured)
  if (!countries.some((c) => c.name === n)) fail(`worldle featured country not found: ${n}`);
if (errors.length) {
  console.error(errors.map((e) => `error: ${e}`).join('\n'));
  process.exit(1);
}
writeFileSync(new URL('countries.json', DAILY), JSON.stringify(countries) + '\n');
console.log(`countries.json: ${countries.length} countries`);
