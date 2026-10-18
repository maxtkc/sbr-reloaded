// Daily puzzle UI helpers, plus the core re-exported for the puzzles.
import data from './data.json';
import { daily, stats, streak } from './core';

export * from './core';

export function fact(salt: string, pool: readonly string[] = data.facts): string {
  return daily(pool, `fact-${salt}`);
}

const CSS = `
.dp{position:absolute;inset:0;overflow-y:auto;background:#f6f7fa;color:#161b26;
font:400 1rem/1.4 var(--sans,system-ui,sans-serif);touch-action:manipulation;-webkit-user-select:none;user-select:none}
.dp input{-webkit-user-select:text;user-select:text}
.dp-in{max-width:32rem;margin:0 auto;padding:1rem 1rem 2rem;display:flex;flex-direction:column;align-items:center;gap:.9rem}
.dp-sub{margin:0;color:#545c6b;font-size:.9rem;text-align:center}
.dp-msg{min-height:1.4em;margin:0;font-weight:600;text-align:center}
.dp-btn{border:0;border-radius:999px;padding:.55rem 1.1rem;background:#152b4e;color:#fff;font:600 .95rem/1 inherit;
font-family:inherit;cursor:pointer}
.dp-btn.ghost{background:#fff;color:#152b4e;box-shadow:inset 0 0 0 2px #152b4e}
.dp-btn:disabled{opacity:.4;cursor:default}
.dp-row{display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center}
.dp-kb{display:flex;flex-direction:column;gap:.35rem;width:100%;max-width:30rem}
.dp-kb div{display:flex;gap:.3rem;justify-content:center}
.dp-kb button{flex:1;min-width:0;height:3.2rem;border:0;border-radius:.3rem;background:#d3d6da;color:#161b26;
font:700 .95rem/1 inherit;font-family:inherit;cursor:pointer;text-transform:uppercase}
.dp-kb button.wide{flex:1.6;font-size:.75rem}
.dp-kb button.g{background:#6aaa64;color:#fff}.dp-kb button.y{background:#c9b458;color:#fff}
.dp-kb button.x{background:#787c7e;color:#fff}
.dp-result{width:100%;padding:1rem;border-top:4px solid #e3261c;border-radius:10px;background:#fff;
box-shadow:0 2px 10px rgba(12,26,49,.12);text-align:center}
.dp-result h2{margin:0 0 .3rem;font:700 1.5rem/1.2 var(--serif,Georgia,serif);color:#0c1a31}
.dp-result .big{margin:.2rem 0;font-size:1.6rem;font-weight:700}
.dp-result .fact{margin:.75rem 0;color:#545c6b;font-style:italic}
.dp-result .meta{margin:.5rem 0;font-size:.85rem;color:#545c6b}
`;

// Scrolling light page inside the game root. Returns the inner column.
export function shell(root: HTMLElement, sub: string): { el: HTMLElement; inner: HTMLElement } {
  if (!document.getElementById('dp-css')) {
    const style = document.createElement('style');
    style.id = 'dp-css';
    style.textContent = CSS;
    document.head.append(style);
  }
  const el = document.createElement('div');
  el.className = 'dp';
  const inner = document.createElement('div');
  inner.className = 'dp-in';
  const p = document.createElement('p');
  p.className = 'dp-sub';
  p.textContent = sub;
  inner.append(p);
  el.append(inner);
  root.append(el);
  return { el, inner };
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

export function button(label: string, onClick: () => void, cls = 'dp-btn'): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// On-screen keyboard plus physical keys. onKey gets a letter, 'ENTER' or 'BACK'.
export function keyboard(
  onKey: (key: string) => void,
  withEnter = true,
): { el: HTMLElement; mark: (letter: string, cls: string) => void; destroy: () => void } {
  const el = h('div', 'dp-kb');
  const keys = new Map<string, HTMLButtonElement>();
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  rows.forEach((row, i) => {
    const line = h('div');
    if (i === 2 && withEnter) line.append(button('Enter', () => onKey('ENTER'), 'wide'));
    for (const ch of row) {
      const b = button(ch, () => onKey(ch), '');
      keys.set(ch, b);
      line.append(b);
    }
    if (i === 2) line.append(button('Del', () => onKey('BACK'), 'wide'));
    el.append(line);
  });
  const onDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
    if (e.key === 'Enter' && withEnter) onKey('ENTER');
    else if (e.key === 'Backspace') onKey('BACK');
    else if (/^[a-z]$/i.test(e.key)) onKey(e.key.toUpperCase());
    else return;
    e.preventDefault();
  };
  addEventListener('keydown', onDown);
  const rank: Record<string, number> = { x: 1, y: 2, g: 3 };
  return {
    el,
    // Colours a key, never downgrading green to yellow or yellow to grey.
    mark(letter, cls) {
      const b = keys.get(letter);
      if (!b) return;
      const cur = ['g', 'y', 'x'].find((c) => b.classList.contains(c));
      if (cur && rank[cur] >= rank[cls]) return;
      b.classList.remove('g', 'y', 'x');
      b.classList.add(cls);
    },
    destroy: () => removeEventListener('keydown', onDown),
  };
}

// Result card: headline, score, streak, an SBR fact, and a retry button for failed attempts.
export function result(
  slug: string,
  opts: { title: string; score: string; solved: boolean; fact: string; retry?: () => void },
): HTMLElement {
  const card = h('div', 'dp-result');
  card.append(h('h2', '', opts.title), h('p', 'big', opts.score));
  const { played, solved } = stats(slug);
  card.append(
    h('p', 'meta', `Streak ${streak(slug)} - played ${played} - solved ${solved}`),
    h('p', 'fact', opts.fact),
  );
  if (opts.retry) card.append(button('Try again', opts.retry));
  else if (opts.solved) card.append(h('p', 'meta', 'Come back tomorrow for a new one.'));
  return card;
}
