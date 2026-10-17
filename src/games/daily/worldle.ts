// Daily Worldle: name the country from its silhouette in 6 guesses. Each guess gives distance, direction
// and proximity from the guessed country to the answer.
import data from './data.json';
import countries from './countries.json';
import { daily, fact, getDay, h, result, setDay, shell } from './common';

const SLUG = 'daily-worldle';
const ROWS = 6;
const HALF_EARTH_KM = 20037;

const CSS = `
.wl-shape{width:min(15rem,70vw);aspect-ratio:1;padding:.5rem;border-radius:10px;background:#fff;
box-shadow:0 2px 10px rgba(12,26,49,.1)}
.wl-shape path{fill:#152b4e}
.wl-rows{display:grid;gap:.35rem;width:100%}
.wl-row{display:grid;grid-template-columns:1fr 5rem 2.4rem 3.4rem;gap:.35rem;height:2.4rem}
.wl-row>*{display:flex;align-items:center;justify-content:center;border-radius:.3rem;background:#e6e8ee;
font-weight:600;font-size:.9rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.wl-row>:first-child{justify-content:flex-start;padding:0 .5rem}
.wl-row.win>*{background:#6aaa64;color:#fff}
.wl-row svg{width:1.4rem;height:1.4rem}
.wl-in{position:relative;width:100%}
.wl-in input{width:100%;padding:.7rem .8rem;border:2px solid #d3d6da;border-radius:.4rem;font:inherit;font-size:1rem}
.wl-in input:focus{outline:none;border-color:#152b4e}
.wl-sug{position:absolute;z-index:1;left:0;right:0;top:100%;margin:.25rem 0 0;padding:0;list-style:none;background:#fff;
border-radius:.4rem;box-shadow:0 4px 16px rgba(12,26,49,.2);max-height:12rem;overflow-y:auto}
.wl-sug li{padding:.5rem .8rem;cursor:pointer}
.wl-sug li.on,.wl-sug li:hover{background:#e6e8ee}
`;

interface Country {
  name: string;
  lat: number;
  lon: number;
  path: string;
  answer?: boolean;
}

const RAD = Math.PI / 180;

function distanceKm(a: Country, b: Country): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

// Initial compass bearing from a to b, degrees clockwise from north.
function bearing(a: Country, b: Country): number {
  const dLon = (b.lon - a.lon) * RAD;
  const y = Math.sin(dLon) * Math.cos(b.lat * RAD);
  const x =
    Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) -
    Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dLon);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

const SVG = 'http://www.w3.org/2000/svg';

function arrow(deg: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', 'M12 2l7 10h-4.5v10h-5V12H5z');
  p.setAttribute('fill', 'currentColor');
  p.setAttribute('transform', `rotate(${deg.toFixed(0)} 12 12)`);
  svg.append(p);
  return svg;
}

function tick(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', 'M4 12l5 5L20 6');
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '3');
  svg.append(p);
  return svg;
}

interface State {
  guesses: string[];
}

export default function start(root: HTMLElement): () => void {
  const all = countries as Country[];
  const answer = daily(
    all.filter((c) => c.answer !== false),
    'worldle',
  );
  const byName = new Map(all.map((c) => [c.name.toLowerCase(), c]));
  const { el, inner } = shell(root, 'Which country is this? Six guesses.');
  const style = h('style');
  style.textContent = CSS;
  el.append(style);

  const shape = document.createElementNS(SVG, 'svg');
  shape.setAttribute('viewBox', '0 0 100 100');
  shape.setAttribute('class', 'wl-shape');
  shape.setAttribute('role', 'img');
  shape.setAttribute('aria-label', 'Country silhouette');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', answer.path);
  shape.append(path);

  const msg = h('p', 'dp-msg');
  const rows = h('div', 'wl-rows');
  const box = h('div', 'wl-in');
  const input = h('input');
  input.type = 'text';
  input.placeholder = 'Country...';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Country');
  const sug = h('ul', 'wl-sug');
  sug.hidden = true;
  box.append(sug, input);
  const tail = h('div');
  tail.style.width = '100%';
  inner.append(shape, msg, rows, tail);

  let guesses: string[] = [];
  let attempts = getDay(SLUG)?.attempts ?? 0;
  let matches: Country[] = [];
  let active = 0;

  function addRow(c: Country) {
    const row = h('div', 'wl-row');
    const won = c === answer;
    if (won) row.classList.add('win');
    const d = distanceKm(c, answer);
    const dir = h('div');
    dir.append(won ? tick() : arrow(bearing(c, answer)));
    const pct = Math.round(100 * Math.max(0, 1 - d / HALF_EARTH_KM));
    row.append(
      h('div', '', c.name),
      h('div', '', won ? '0 km' : `${Math.round(d).toLocaleString('en-GB')} km`),
      dir,
      h('div', '', `${won ? 100 : pct}%`),
    );
    rows.append(row);
  }

  function suggest() {
    const q = input.value.trim().toLowerCase();
    matches = q
      ? all
          .filter((c) => c.name.toLowerCase().includes(q) && !guesses.includes(c.name))
          .sort(
            (a, b) => +!a.name.toLowerCase().startsWith(q) - +!b.name.toLowerCase().startsWith(q),
          )
          .slice(0, 8)
      : [];
    active = 0;
    sug.replaceChildren(
      ...matches.map((c, i) => {
        const li = h('li', i === active ? 'on' : '', c.name);
        li.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          guess(c);
        });
        return li;
      }),
    );
    sug.hidden = matches.length === 0;
  }

  function guess(c: Country) {
    if (guesses.includes(c.name)) {
      msg.textContent = 'Already guessed';
      return;
    }
    if (guesses.length === 0) {
      attempts++;
      const best = getDay(SLUG);
      setDay(SLUG, { solved: !!best?.solved, score: best?.score ?? 'In progress', attempts });
    }
    guesses.push(c.name);
    input.value = '';
    suggest();
    msg.textContent = '';
    addRow(c);
    const won = c === answer;
    if (won || guesses.length === ROWS) finish(won, true);
  }

  input.addEventListener('input', suggest);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      [...sug.children].forEach((li, i) => li.classList.toggle('on', i === active));
    } else if (e.key === 'Enter') {
      const exact = byName.get(input.value.trim().toLowerCase());
      const pick = exact ?? matches[active];
      if (pick) guess(pick);
      else msg.textContent = 'Not a country on our list';
    }
  });
  input.addEventListener('blur', () => (sug.hidden = true));
  input.addEventListener('focus', suggest);

  function finish(solved: boolean, fresh: boolean) {
    const score = solved ? `${guesses.length}/${ROWS}` : `X/${ROWS}`;
    if (fresh) {
      const best = getDay(SLUG);
      setDay(SLUG, {
        solved: solved || !!best?.solved,
        score: best?.solved ? best.score : score,
        attempts,
        state: { guesses } satisfies State,
      });
    }
    const featured = data.worldle.featured.includes(answer.name);
    tail.replaceChildren(
      result(SLUG, {
        title: solved ? answer.name : `It was ${answer.name}`,
        score: fresh ? score : (getDay(SLUG)?.score ?? score),
        solved,
        fact: featured
          ? data.worldle.facts[1]
          : fact('worldle', [data.worldle.facts[0], ...data.facts]),
        retry: solved ? undefined : reset,
      }),
    );
  }

  function reset() {
    guesses = [];
    rows.replaceChildren();
    msg.textContent = '';
    input.value = '';
    tail.replaceChildren(box);
    input.focus();
  }

  const prev = getDay(SLUG);
  const saved = prev?.state as State | undefined;
  if (prev?.solved && saved?.guesses?.length) {
    guesses = saved.guesses.slice(0, ROWS);
    for (const g of guesses) {
      const c = byName.get(g.toLowerCase());
      if (c) addRow(c);
    }
    finish(true, false);
  } else {
    tail.append(box);
  }

  return () => el.remove();
}
