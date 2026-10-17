// Daily Spelling Bee: words of 4+ letters from the hive, always using the centre letter.
// Found words last for the day. Reaching Genius counts as solved.
import data from './data.json';
import words from './words.json';
import { button, daily, fact, getDay, h, result, setDay, shell, shuffled } from './common';

const SLUG = 'daily-bee';

const CSS = `
.bz-rank{display:flex;align-items:center;gap:.6rem;width:100%;font-weight:700}
.bz-bar{flex:1;display:flex;justify-content:space-between;align-items:center;height:2px;background:#d3d6da}
.bz-bar i{width:.6rem;height:.6rem;border-radius:50%;background:#d3d6da}
.bz-bar i.on{background:#f7da21}
.bz-word{min-height:2.4rem;font:700 1.8rem/1.3 inherit;font-family:inherit;letter-spacing:.05em;text-transform:uppercase}
.bz-word .c{color:#d4a600}
.bz-word .bad{color:#c6c6c6}
.bz-hive{position:relative;width:15rem;height:15.5rem}
.bz-hive button{position:absolute;width:5.2rem;height:4.5rem;border:0;background:#e6e6e6;color:#161b26;
clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);font:700 1.6rem/1 inherit;font-family:inherit;cursor:pointer}
.bz-hive button.c{background:#f7da21}
.bz-hive button:active{transform:scale(.94)}
.bz-found{width:100%;padding:.6rem .8rem;border:1px solid #d3d6da;border-radius:.4rem;background:#fff;font-size:.95rem}
.bz-found p{margin:0 0 .3rem;font-weight:600}
.bz-found ul{display:flex;flex-wrap:wrap;gap:.2rem .9rem;margin:0;padding:0;list-style:none;text-transform:capitalize}
.bz-found li.p{font-weight:700}
`;

// Hive slot positions (left, top) in rem: centre first, then clockwise from the top.
const SLOTS = [
  [4.9, 5.5],
  [4.9, 0.9],
  [8.85, 3.2],
  [8.85, 7.8],
  [4.9, 10.1],
  [0.95, 7.8],
  [0.95, 3.2],
];

interface State {
  found: string[];
}

export default function start(root: HTMLElement): () => void {
  const puzzle = daily(words.bee, 'bee');
  const letters = [puzzle.centre, ...puzzle.outer];
  const accepted = new Set(puzzle.words);
  const prev = getDay(SLUG);
  const found: string[] = ((prev?.state as State | undefined)?.found ?? []).filter((w) =>
    accepted.has(w),
  );
  const { el, inner } = shell(
    root,
    `Make words with the centre letter ${puzzle.centre}. Find the pangram.`,
  );
  const style = h('style');
  style.textContent = CSS;
  el.append(style);

  const rankRow = h('div', 'bz-rank');
  const msg = h('p', 'dp-msg');
  const word = h('div', 'bz-word');
  const hive = h('div', 'bz-hive');
  const controls = h('div', 'dp-row');
  const foundBox = h('div', 'bz-found');
  const tail = h('div');
  tail.style.width = '100%';
  inner.append(rankRow, msg, word, hive, controls, foundBox, tail);

  let current = '';
  let outer = puzzle.outer.slice();
  let attempts = prev?.attempts ?? 0;
  const isPangram = (w: string) => letters.every((l) => w.includes(l));
  const points = (w: string) => (w.length === 4 ? 1 : w.length) + (isPangram(w) ? 7 : 0);
  const total = () => found.reduce((s, w) => s + points(w), 0);
  const ranks = data.bee.ranks.map(([name, pct]) => ({
    name: name as string,
    min: Math.round((puzzle.max * (pct as number)) / 100),
  }));
  const rankOf = (pts: number) => ranks.filter((r) => pts >= r.min).pop()!;
  const genius = ranks[ranks.length - 1];

  function renderHive() {
    hive.replaceChildren(
      ...[puzzle.centre, ...outer].map((l, i) => {
        const b = button(l, () => type(l), i === 0 ? 'c' : '');
        b.style.left = `${SLOTS[i][0]}rem`;
        b.style.top = `${SLOTS[i][1]}rem`;
        return b;
      }),
    );
  }

  function renderWord() {
    word.replaceChildren(
      ...[...current].map((ch) =>
        h('span', ch === puzzle.centre ? 'c' : letters.includes(ch) ? '' : 'bad', ch),
      ),
    );
  }

  function renderFound() {
    const pts = total();
    const rank = rankOf(pts);
    const bar = h('div', 'bz-bar');
    for (const r of ranks) bar.append(h('i', pts >= r.min ? 'on' : ''));
    rankRow.replaceChildren(h('span', '', rank.name), bar, h('span', '', `${pts}`));
    foundBox.replaceChildren(
      h('p', '', `You have found ${found.length} word${found.length === 1 ? '' : 's'}`),
    );
    const ul = h('ul');
    for (const w of found.slice().sort())
      ul.append(h('li', isPangram(w) ? 'p' : '', w.toLowerCase()));
    foundBox.append(ul);
  }

  function save() {
    const pts = total();
    const solved = pts >= genius.min;
    setDay(SLUG, {
      solved,
      score: `${rankOf(pts).name}, ${pts} pts`,
      attempts,
      state: { found } satisfies State,
    });
    if (solved && !tail.firstChild)
      tail.append(
        result(SLUG, { title: 'Genius', score: `${pts} pts`, solved: true, fact: fact('bee') }),
      );
  }

  function type(l: string) {
    if (current.length < 19) current += l;
    msg.textContent = '';
    renderWord();
  }

  function submit() {
    const w = current;
    current = '';
    renderWord();
    if (!w) return;
    if (w.length < 4) msg.textContent = 'Too short';
    else if (!w.includes(puzzle.centre)) msg.textContent = 'Missing centre letter';
    else if ([...w].some((ch) => !letters.includes(ch))) msg.textContent = 'Bad letters';
    else if (found.includes(w)) msg.textContent = 'Already found';
    else if (!accepted.has(w)) msg.textContent = 'Not in word list';
    else {
      if (!found.length && !attempts) attempts = 1;
      found.push(w);
      const p = points(w);
      msg.textContent = isPangram(w)
        ? `Pangram! +${p}`
        : `${p === 1 ? 'Good' : p < 7 ? 'Nice' : 'Awesome'}! +${p}`;
      renderFound();
      save();
    }
  }

  controls.append(
    button(
      'Delete',
      () => {
        current = current.slice(0, -1);
        renderWord();
      },
      'dp-btn ghost',
    ),
    button(
      'Shuffle',
      () => {
        outer = shuffled(outer, Math.random() * 1e9);
        renderHive();
      },
      'dp-btn ghost',
    ),
    button('Enter', submit),
  );

  const onDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') submit();
    else if (e.key === 'Backspace') {
      current = current.slice(0, -1);
      renderWord();
    } else if (/^[a-z]$/i.test(e.key)) type(e.key.toUpperCase());
    else return;
    e.preventDefault();
  };
  addEventListener('keydown', onDown);

  renderHive();
  renderWord();
  renderFound();
  if (total() >= genius.min)
    tail.append(
      result(SLUG, { title: 'Genius', score: `${total()} pts`, solved: true, fact: fact('bee') }),
    );

  return () => {
    removeEventListener('keydown', onDown);
    el.remove();
  };
}
