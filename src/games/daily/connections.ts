// Daily Connections: 16 tiles in 4 hidden groups of 4. Four mistakes end the attempt; retries reshuffle.
import data from './data.json';
import {
  button,
  daily,
  fact,
  getDay,
  h,
  hash,
  result,
  setDay,
  shell,
  shuffled,
  today,
} from './common';

const SLUG = 'daily-connections';
const LIVES = 4;
const COLOURS = ['#f9df6d', '#a0c35a', '#b0c4ef', '#ba81c5'];

const CSS = `
.cn-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem;width:100%}
.cn-tile{min-height:4.2rem;padding:.25rem;border:0;border-radius:.4rem;background:#e6e4dc;color:#161b26;
font:700 clamp(.6rem,2.8vw,.9rem)/1.1 inherit;font-family:inherit;text-transform:uppercase;cursor:pointer;
overflow-wrap:normal;transition:transform .15s}
.cn-tile.long{font-size:clamp(.5rem,2.1vw,.8rem)}
.cn-tile.sel{background:#5a594e;color:#fff}
.cn-tile.shake{animation:cn-shake .4s}
.cn-group{grid-column:1/-1;min-height:4.2rem;display:flex;flex-direction:column;justify-content:center;
border-radius:.4rem;padding:.4rem;text-align:center;animation:cn-pop .3s}
.cn-group b{text-transform:uppercase}
.cn-group span{font-size:.85rem;text-transform:uppercase}
.cn-lives{display:flex;gap:.4rem;align-items:center;font-size:.9rem;color:#545c6b}
.cn-lives i{width:.8rem;height:.8rem;border-radius:50%;background:#5a594e}
@keyframes cn-shake{20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
@keyframes cn-pop{0%{transform:scale(.9)}100%{transform:none}}
`;

interface Group {
  name: string;
  words: string[];
  level: number;
}

export default function start(root: HTMLElement): () => void {
  const groups: Group[] = data.connections.groups.map((level, i) => ({
    ...daily(level, `connections-${i}`),
    level: i,
  }));
  const { el, inner } = shell(root, 'Find four groups of four.');
  const style = h('style');
  style.textContent = CSS;
  el.append(style);

  const msg = h('p', 'dp-msg');
  const grid = h('div', 'cn-grid');
  const lives = h('div', 'cn-lives');
  const controls = h('div', 'dp-row');
  const tail = h('div');
  tail.style.width = '100%';
  inner.append(msg, grid, lives, controls, tail);

  let solved: Group[] = [];
  let order: string[] = [];
  let selected = new Set<string>();
  let mistakes = 0;
  let tried = new Set<string>();
  let attempts = getDay(SLUG)?.attempts ?? 0;
  let started = false;

  const shuffleBtn = button(
    'Shuffle',
    () => {
      order = shuffled(order, Math.random() * 1e9);
      render();
    },
    'dp-btn ghost',
  );
  const clearBtn = button(
    'Deselect',
    () => {
      selected.clear();
      render();
    },
    'dp-btn ghost',
  );
  const submitBtn = button('Submit', submit);
  controls.append(shuffleBtn, clearBtn, submitBtn);

  function groupEl(g: Group) {
    const box = h('div', 'cn-group');
    box.style.background = COLOURS[g.level];
    box.append(h('b', '', g.name), h('span', '', g.words.join(', ')));
    return box;
  }

  function render() {
    grid.replaceChildren(
      ...solved.map(groupEl),
      ...order.map((w) => {
        const t = button(
          w,
          () => toggle(w),
          'cn-tile' + (selected.has(w) ? ' sel' : '') + (w.length > 9 ? ' long' : ''),
        );
        t.dataset.word = w;
        return t;
      }),
    );
    lives.replaceChildren(
      h('span', '', 'Mistakes remaining:'),
      ...Array.from({ length: LIVES - mistakes }, () => h('i')),
    );
    submitBtn.disabled = selected.size !== 4;
    clearBtn.disabled = selected.size === 0;
  }

  function toggle(w: string) {
    if (selected.has(w)) selected.delete(w);
    else if (selected.size < 4) selected.add(w);
    msg.textContent = '';
    render();
  }

  function submit() {
    if (selected.size !== 4) return;
    const pick = [...selected];
    const key = pick.slice().sort().join('|');
    if (tried.has(key)) {
      msg.textContent = 'Already guessed';
      return;
    }
    tried.add(key);
    if (!started) {
      started = true;
      attempts++;
      const best = getDay(SLUG);
      setDay(SLUG, { solved: !!best?.solved, score: best?.score ?? 'In progress', attempts });
    }
    const hit = groups.find((g) => !solved.includes(g) && pick.every((w) => g.words.includes(w)));
    if (hit) {
      solved.push(hit);
      order = order.filter((w) => !hit.words.includes(w));
      selected.clear();
      render();
      if (solved.length === 4) finish(true);
      return;
    }
    const close = groups.some((g) => pick.filter((w) => g.words.includes(w)).length === 3);
    mistakes++;
    msg.textContent = close ? 'One away...' : 'Not a group';
    grid.querySelectorAll<HTMLElement>('.cn-tile.sel').forEach((t) => {
      t.classList.remove('shake');
      void t.offsetWidth;
      t.classList.add('shake');
    });
    if (mistakes >= LIVES) {
      selected.clear();
      // Reveal the rest, easiest first.
      solved = [...solved, ...groups.filter((g) => !solved.includes(g))];
      order = [];
      render();
      finish(false);
    } else render();
  }

  function finish(won: boolean) {
    const score = won ? `Solved, ${mistakes} mistake${mistakes === 1 ? '' : 's'}` : 'Failed';
    const best = getDay(SLUG);
    setDay(SLUG, {
      solved: won || !!best?.solved,
      score: best?.solved ? best.score : score,
      attempts,
    });
    controls.hidden = true;
    lives.hidden = true;
    tail.replaceChildren(
      result(SLUG, {
        title: won ? 'Connected' : 'Out of mistakes',
        score,
        solved: won,
        fact: fact('connections'),
        retry: won ? undefined : reset,
      }),
    );
  }

  function reset() {
    solved = [];
    selected = new Set();
    tried = new Set();
    mistakes = 0;
    started = false;
    order = shuffled(
      groups.flatMap((g) => g.words),
      hash(today() + 'connections') + attempts,
    );
    controls.hidden = false;
    lives.hidden = false;
    msg.textContent = '';
    tail.replaceChildren();
    render();
  }

  reset();
  const prev = getDay(SLUG);
  if (prev?.solved) {
    // Already solved today: show the answers.
    solved = groups.slice();
    order = [];
    render();
    controls.hidden = true;
    lives.hidden = true;
    tail.replaceChildren(
      result(SLUG, {
        title: 'Connected',
        score: prev.score,
        solved: true,
        fact: fact('connections'),
      }),
    );
  }

  return () => el.remove();
}
