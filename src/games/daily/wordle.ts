// Daily Wordle: 6 guesses at a themed 5-letter word. Failed attempts can be retried with a fresh board.
import data from './data.json';
import words from './words.json';
import { daily, fact, getDay, h, keyboard, result, setDay, shell } from './common';

const SLUG = 'daily-wordle';
const ROWS = 6;

const CSS = `
.wd-board{display:grid;grid-template-rows:repeat(6,1fr);gap:.35rem;width:min(18rem,80vw)}
.wd-row{display:grid;grid-template-columns:repeat(5,1fr);gap:.35rem}
.wd-row.shake{animation:wd-shake .4s}
.wd-cell{aspect-ratio:1;display:grid;place-items:center;border:2px solid #d3d6da;background:#fff;
font:700 1.8rem/1 inherit;font-family:inherit;text-transform:uppercase}
.wd-cell.f{border-color:#878a8c}
.wd-cell.g,.wd-cell.y,.wd-cell.x{border-color:transparent;color:#fff;animation:wd-flip .5s both}
.wd-cell.g{background:#6aaa64}.wd-cell.y{background:#c9b458}.wd-cell.x{background:#787c7e}
@keyframes wd-flip{0%{transform:rotateX(90deg)}100%{transform:none}}
@keyframes wd-shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
`;

// Green/yellow/grey per letter, counting duplicates the standard way: greens first, then yellows left to right.
export function grade(guess: string, answer: string): string[] {
  const out = Array(5).fill('x');
  const left: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = 'g';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === 'g') continue;
    if (left[guess[i]]) {
      out[i] = 'y';
      left[guess[i]]--;
    }
  }
  return out;
}

interface State {
  guesses: string[];
}

export default function start(root: HTMLElement): () => void {
  const answer = daily(data.wordle.answers, 'wordle');
  const valid = new Set(words.guesses.split(' '));
  const { el, inner } = shell(root, "Guess today's SBR word in six tries.");
  const style = h('style');
  style.textContent = CSS;
  el.append(style);

  const msg = h('p', 'dp-msg');
  const board = h('div', 'wd-board');
  const cells: HTMLElement[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row = h('div', 'wd-row');
    cells.push([]);
    for (let c = 0; c < 5; c++) {
      const cell = h('div', 'wd-cell');
      cells[r].push(cell);
      row.append(cell);
    }
    board.append(row);
  }
  const tail = h('div');
  tail.style.width = '100%';
  inner.append(msg, board, tail);

  let guesses: string[] = [];
  let current = '';
  let done = false;
  let kb = keyboard(onKey);
  const prev = getDay(SLUG);
  let attempts = prev?.attempts ?? 0;

  function paintRow(r: number, word: string, marks?: string[]) {
    cells[r].forEach((cell, i) => {
      cell.textContent = word[i] ?? '';
      cell.className = 'wd-cell' + (word[i] ? ' f' : '');
      if (marks) {
        cell.classList.add(marks[i]);
        cell.style.animationDelay = `${i * 0.12}s`;
      }
    });
  }

  function reveal(r: number, word: string) {
    const marks = grade(word, answer);
    paintRow(r, word, marks);
    [...word].forEach((ch, i) => kb.mark(ch, marks[i]));
  }

  function finish(solved: boolean, fresh: boolean) {
    done = true;
    const score = solved ? `${guesses.length}/${ROWS}` : `X/${ROWS}`;
    if (fresh) {
      const best = getDay(SLUG);
      // The first solve of the day keeps its score; later replays only count attempts.
      setDay(SLUG, {
        solved: solved || !!best?.solved,
        score: best?.solved ? best.score : score,
        attempts,
        state: { guesses } satisfies State,
      });
    }
    kb.el.remove();
    tail.replaceChildren(
      result(SLUG, {
        title: solved ? 'Solved' : `The word was ${answer}`,
        score,
        solved,
        fact: fact('wordle'),
        retry: solved ? undefined : reset,
      }),
    );
  }

  function reset() {
    guesses = [];
    current = '';
    done = false;
    msg.textContent = '';
    for (let r = 0; r < ROWS; r++) paintRow(r, '');
    kb.destroy();
    kb = keyboard(onKey);
    tail.replaceChildren(kb.el);
  }

  function onKey(key: string) {
    if (done) return;
    const r = guesses.length;
    if (key === 'BACK') current = current.slice(0, -1);
    else if (key === 'ENTER') {
      if (current.length < 5) return flash('Not enough letters');
      if (!valid.has(current)) return flash('Not in the word list');
      if (r === 0) {
        attempts++;
        const best = getDay(SLUG);
        setDay(SLUG, {
          solved: !!best?.solved,
          score: best?.score ?? 'In progress',
          attempts,
        });
      }
      guesses.push(current);
      reveal(r, current);
      const won = current === answer;
      current = '';
      if (won || guesses.length === ROWS) setTimeout(() => finish(won, true), 900);
      return;
    } else if (current.length < 5) current += key;
    paintRow(r, current);
    msg.textContent = '';
  }

  function flash(text: string) {
    msg.textContent = text;
    const row = board.children[guesses.length] as HTMLElement;
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
  }

  // Replaying after today's solve shows the solved board.
  const saved = prev?.state as State | undefined;
  if (prev?.solved && saved?.guesses?.length) {
    guesses = saved.guesses.slice(0, ROWS);
    guesses.forEach((g, r) => reveal(r, g));
    finish(true, false);
    tail.querySelector('.big')!.textContent = prev.score;
  } else {
    tail.append(kb.el);
  }

  return () => {
    kb.destroy();
    el.remove();
  };
}
