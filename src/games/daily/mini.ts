// Daily mini crossword: 5x5 grid, tap a cell to select, tap again to switch direction. Scored by time.
import data from './data.json';
import { daily, fact, getDay, h, keyboard, result, setDay, shell } from './common';

const SLUG = 'daily-mini';

const CSS = `
.mn-clue{display:flex;gap:.6rem;align-items:center;width:100%;min-height:3.2rem;padding:.5rem .75rem;border-radius:.4rem;
background:#d6e4f7;font-weight:600;cursor:pointer}
.mn-clue b{flex:none}
.mn-grid{display:grid;grid-template-columns:repeat(5,1fr);width:min(20rem,86vw,max(12rem,100dvh - 27rem));border:2px solid #161b26;background:#161b26;gap:1px}
.mn-cell{position:relative;aspect-ratio:1;display:grid;place-items:center;background:#fff;
font:700 clamp(1.1rem,6vw,2rem)/1 inherit;font-family:inherit;cursor:pointer}
.mn-cell.blk{background:#161b26;cursor:default}
.mn-cell.word{background:#a7d8ff}.mn-cell.cur{background:#ffda00}
.mn-cell.ok{color:#2860d8}
.mn-cell small{position:absolute;top:.15rem;left:.2rem;font-size:.6rem;font-weight:600}
.mn-timer{font-variant-numeric:tabular-nums;font-weight:700}
.mn-list{display:grid;grid-template-columns:1fr 1fr;gap:1rem;width:100%;font-size:.9rem}
.mn-list h3{margin:0 0 .3rem;font-size:.8rem;text-transform:uppercase;color:#545c6b}
.mn-list ol{margin:0;padding:0;list-style:none}
.mn-list li{padding:.15rem .3rem;border-radius:.2rem;cursor:pointer}
.mn-list li.on{background:#d6e4f7}
@media (max-width:30rem){.mn-list{display:none}}
`;

interface Entry {
  n: number;
  dir: 'a' | 'd';
  cells: number[];
  clue: string;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function start(root: HTMLElement): () => void {
  const puzzle = daily(data.mini, 'mini');
  const sol = puzzle.grid.join('');
  const { el, inner } = shell(root, 'Fill the grid. The clock is running.');
  const style = h('style');
  style.textContent = CSS;
  el.append(style);

  // Numbered entries, in the same order as the clue lists.
  const at = (r: number, c: number) =>
    r >= 0 && r < 5 && c >= 0 && c < 5 ? puzzle.grid[r][c] : '#';
  const entries: Entry[] = [];
  const numbers: number[] = Array(25).fill(0);
  let n = 0;
  let ai = 0;
  let di = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      if (at(r, c) === '#') continue;
      const a = at(r, c - 1) === '#' && at(r, c + 1) !== '#';
      const d = at(r - 1, c) === '#' && at(r + 1, c) !== '#';
      if (!a && !d) continue;
      numbers[r * 5 + c] = ++n;
      const run = (dr: number, dc: number) => {
        const out: number[] = [];
        for (let i = 0; at(r + dr * i, c + dc * i) !== '#'; i++)
          out.push((r + dr * i) * 5 + c + dc * i);
        return out;
      };
      if (a) entries.push({ n, dir: 'a', cells: run(0, 1), clue: puzzle.across[ai++] });
      if (d) entries.push({ n, dir: 'd', cells: run(1, 0), clue: puzzle.down[di++] });
    }

  const timer = h('span', 'mn-timer', '0:00');
  const clueBar = h('div', 'mn-clue');
  const grid = h('div', 'mn-grid');
  const msg = h('p', 'dp-msg');
  const list = h('div', 'mn-list');
  const tail = h('div');
  tail.style.width = '100%';
  inner.append(timer, clueBar, grid, msg, tail, list);

  const fill: string[] = Array(25).fill('');
  const cellEls = [...sol].map((ch, i) => {
    const cell = h('div', ch === '#' ? 'mn-cell blk' : 'mn-cell');
    if (numbers[i]) cell.append(h('small', '', String(numbers[i])));
    cell.append(h('span'));
    if (ch !== '#') cell.addEventListener('click', () => tap(i));
    grid.append(cell);
    return cell;
  });
  const clueEls = new Map<Entry, HTMLLIElement>();
  for (const dir of ['a', 'd'] as const) {
    const col = h('div');
    col.append(h('h3', '', dir === 'a' ? 'Across' : 'Down'));
    const ol = h('ol');
    for (const e of entries.filter((x) => x.dir === dir)) {
      const li = h('li', '', `${e.n} ${e.clue}`);
      li.addEventListener('click', () => {
        cur = e.cells.find((i) => !fill[i]) ?? e.cells[0];
        dirNow = e.dir;
        render();
      });
      clueEls.set(e, li);
      ol.append(li);
    }
    col.append(ol);
    list.append(col);
  }

  let cur = entries[0].cells[0];
  let dirNow: 'a' | 'd' = 'a';
  let done = false;
  let seconds = 0;
  const prev = getDay(SLUG);
  const attempts = (prev?.attempts ?? 0) + (prev?.solved ? 0 : 1);
  const clock = setInterval(() => {
    if (done || document.hidden) return;
    seconds++;
    timer.textContent = fmt(seconds);
  }, 1000);

  const entryOf = (i: number, dir: 'a' | 'd') =>
    entries.find((e) => e.dir === dir && e.cells.includes(i)) ??
    entries.find((e) => e.cells.includes(i))!;

  function render() {
    const e = entryOf(cur, dirNow);
    dirNow = e.dir;
    cellEls.forEach((cell, i) => {
      if (sol[i] === '#') return;
      cell.classList.toggle('word', e.cells.includes(i));
      cell.classList.toggle('cur', i === cur && !done);
      cell.querySelector('span')!.textContent = fill[i];
    });
    clueBar.replaceChildren(
      h('b', '', `${e.n}${e.dir === 'a' ? 'A' : 'D'}`),
      h('span', '', e.clue),
    );
    clueEls.forEach((li, x) => li.classList.toggle('on', x === e));
  }

  function tap(i: number) {
    if (done) return;
    if (i === cur) dirNow = dirNow === 'a' ? 'd' : 'a';
    cur = i;
    render();
  }
  clueBar.addEventListener('click', () => tap(cur));

  // Next empty cell in the word (wrapping), else the first empty cell of a following entry.
  function advance() {
    const e = entryOf(cur, dirNow);
    const k = e.cells.indexOf(cur);
    const inWord = [...e.cells.slice(k + 1), ...e.cells.slice(0, k)].find((i) => !fill[i]);
    if (inWord !== undefined) {
      cur = inWord;
      return;
    }
    const idx = entries.indexOf(e);
    const next = [...entries.slice(idx + 1), ...entries.slice(0, idx)].find((x) =>
      x.cells.some((i) => !fill[i]),
    );
    if (next) {
      cur = next.cells.find((i) => !fill[i])!;
      dirNow = next.dir;
    }
  }

  function move(dr: number, dc: number) {
    let r = Math.floor(cur / 5);
    let c = cur % 5;
    for (let step = 0; step < 5; step++) {
      r += dr;
      c += dc;
      if (r < 0 || r > 4 || c < 0 || c > 4) return;
      if (sol[r * 5 + c] !== '#') {
        cur = r * 5 + c;
        return;
      }
    }
  }

  function onKey(key: string) {
    if (done) return;
    if (key === 'BACK') {
      if (fill[cur]) fill[cur] = '';
      else {
        const e = entryOf(cur, dirNow);
        const k = e.cells.indexOf(cur);
        if (k > 0) {
          cur = e.cells[k - 1];
          fill[cur] = '';
        }
      }
    } else if (/^[A-Z]$/.test(key)) {
      fill[cur] = key;
      if (fill.every((f, i) => f || sol[i] === '#')) check();
      else advance();
    }
    render();
  }

  function onArrow(e: KeyboardEvent) {
    const dirs: Record<string, [number, number, 'a' | 'd']> = {
      ArrowUp: [-1, 0, 'd'],
      ArrowDown: [1, 0, 'd'],
      ArrowLeft: [0, -1, 'a'],
      ArrowRight: [0, 1, 'a'],
    };
    const d = dirs[e.key];
    if (!d || done) return;
    e.preventDefault();
    if (dirNow !== d[2]) dirNow = d[2];
    else move(d[0], d[1]);
    render();
  }
  addEventListener('keydown', onArrow);

  function check() {
    if (fill.every((f, i) => sol[i] === '#' || f === sol[i])) finish(true);
    else msg.textContent = 'Not quite. Something in there is wrong.';
  }

  function finish(fresh: boolean) {
    done = true;
    clearInterval(clock);
    cellEls.forEach((cell, i) => sol[i] !== '#' && cell.classList.add('ok'));
    msg.textContent = '';
    kb.el.remove();
    const score = fresh ? fmt(seconds) : (prev?.score ?? '');
    if (fresh) setDay(SLUG, { solved: true, score, attempts });
    tail.replaceChildren(
      result(SLUG, { title: 'Solved', score, solved: true, fact: fact('mini') }),
    );
    render();
  }

  const kb = keyboard(onKey, false);
  if (prev?.solved) {
    [...sol].forEach((ch, i) => (fill[i] = ch === '#' ? '' : ch));
    finish(false);
    timer.textContent = prev.score;
  } else {
    setDay(SLUG, { solved: false, score: 'In progress', attempts });
    tail.append(kb.el);
    render();
  }

  return () => {
    clearInterval(clock);
    kb.destroy();
    removeEventListener('keydown', onArrow);
    el.remove();
  };
}
