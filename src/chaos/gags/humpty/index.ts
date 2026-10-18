// Humpty Dumpty sits on a brick wall at the end of the History heading on the home page. Clicking him knocks him
// off into the section's bottom padding, where he breaks. King's College horses and men trot in; clicking each one
// makes a failed attempt to put him back together, and after all have tried the rhyme's last line plays out.
import { onPause, onResume } from '../../bus';
import { found } from '../../eggs';
import { beep, boom } from '../../shared/sfx';
import { HORSE, HUMPTY, MAN, PILE, WALL } from './sprites';

interface Data {
  fall: string[];
  men: string[];
  horses: string[];
  finale: string;
  facts: string[];
  porter: string[];
}

// Rows Humpty's wall can stand at the end of, in order of preference.
const ROWS = ['#history > .wrap > h2', '#history > .wrap > .btn'];
const WALL_W = 64;
// Humpty is 50 tall and his shell ends at y 42, where the 24 tall wall starts.
const PERCH_H = 66;
// Order of the party from left to right; the pile is to their right.
const PARTY = ['horse', 'man', 'horse', 'man', 'man'] as const;

const CSS = `
.hd-scene{position:absolute;inset:0;pointer-events:none;z-index:2}
.hd-scene svg{display:block}
.hd-perch{position:absolute;right:0;width:${WALL_W}px;height:${PERCH_H}px}
.hd-wall{position:absolute;left:0;bottom:0;line-height:0}
.hd-humpty{position:absolute;left:12px;top:0;z-index:1;width:40px;height:50px;line-height:0;pointer-events:auto;
cursor:pointer;transform-origin:50% 84%;animation:hd-wobble var(--hd-wobble,5s) ease-in-out infinite}
.hd-humpty svg{transform-origin:50% 84%;transition:rotate .3s}
.hd-humpty:hover svg,.hd-humpty:focus-visible svg{rotate:14deg}
.hd-humpty.falling{animation:none}
.hd-leg{transform-box:fill-box;transform-origin:50% 0;animation:hd-swing var(--hd-swing,1.1s) ease-in-out infinite alternate}
.hd-leg-b{animation-delay:calc(var(--hd-swing,1.1s) * -1)}
.hd-pile{position:absolute;right:4px;top:calc(100% + 6px);width:56px;height:48px;line-height:0;visibility:hidden;
transform-origin:50% 100%}
.hd-pile.on{visibility:visible;animation:hd-splat .3s ease-out}
.hd-pile.crumble{animation:hd-shake .3s}
.hd-shards,.hd-whole{transition:opacity .15s}
.hd-whole{opacity:0;transform-box:fill-box;transform-origin:50% 100%}
.hd-pile.fixing .hd-shards{opacity:0}
.hd-pile.fixing .hd-whole{opacity:1;animation:hd-jiggle .4s ease-in-out}
.hd-blink{transform-box:fill-box;transform-origin:center;animation:hd-blink 4s infinite}
.hd-party{position:absolute;right:66px;top:calc(100% + 4px);display:none;align-items:flex-end;gap:2px}
.hd-party.on{display:flex}
.hd-fig{line-height:0;pointer-events:auto;cursor:pointer;animation:hd-trot 1s cubic-bezier(.2,.7,.3,1) var(--hd-d) both}
.hd-fig svg{animation:hd-bob .18s ease-in-out var(--hd-d) 6 alternate}
.hd-fig.try svg{animation:hd-hop .5s ease-out}
.hd-party.leave .hd-fig{animation:hd-off 1.2s ease-in var(--hd-d) forwards}
.hd-humpty:focus-visible,.hd-fig:focus-visible{outline:2px solid #c8102e;outline-offset:2px}
.hd-bubble{position:absolute;z-index:3;width:max-content;max-width:220px;padding:.4rem .7rem;border:3px solid #161b26;
border-radius:1rem;background:#fff;color:#161b26;font:700 .85rem/1.15 'Comic Sans MS','Comic Sans',sans-serif;
text-transform:uppercase;text-align:center;pointer-events:none;transform:translate(-50%,calc(-100% - 6px));
transform-origin:50% 100%;animation:hd-pop .25s ease-out}
.hd-bubble.wide{max-width:280px}
.hd-bubble small{display:block;margin-top:.35rem;font-size:.75rem;font-weight:400;text-transform:none}
.hd-scene.paused,.hd-scene.paused *{animation-play-state:paused!important}
@keyframes hd-wobble{0%,70%,100%{rotate:0deg}78%{rotate:-6deg}86%{rotate:5deg}93%{rotate:-2deg}}
@keyframes hd-swing{from{rotate:-18deg}to{rotate:18deg}}
@keyframes hd-splat{0%{scale:1.3 .5}100%{scale:1}}
@keyframes hd-shake{25%{translate:-2px 0}75%{translate:2px 0}}
@keyframes hd-jiggle{25%{rotate:-4deg}75%{rotate:4deg}}
@keyframes hd-blink{0%,92%,100%{scale:1}95%{scale:1 .1}}
@keyframes hd-trot{from{translate:-90px 0;opacity:0}to{translate:0 0;opacity:1}}
@keyframes hd-bob{from{translate:0 0}to{translate:0 -3px}}
@keyframes hd-hop{0%,100%{translate:0 0;rotate:0deg}40%{translate:0 -8px;rotate:8deg}}
@keyframes hd-off{from{translate:0 0;opacity:1}to{translate:-100px 0;opacity:0}}
@keyframes hd-pop{from{scale:.5;opacity:0}}
`;

function readJson<T>(id: string): T | null {
  const text = document.getElementById(id)?.textContent;
  return text ? (JSON.parse(text) as T) : null;
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// Shuffled deck of lines that only repeats once every line has been used.
function deck(lines: string[]): () => string {
  let left: string[] = [];
  return () => {
    if (!left.length) left = [...lines].sort(() => Math.random() - 0.5);
    return left.pop()!;
  };
}

function button(el: HTMLElement, label: string, go: () => void): void {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', label);
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    go();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    go();
  });
}

export default function humpty(): (() => void) | void {
  const data = readJson<Data>('humpty-data');
  const wrap = document.querySelector<HTMLElement>('#history > .wrap');
  if (!data || !wrap) return;
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  // Timeouts that keep their remaining time while gags are paused.
  interface Timer {
    fn: () => void;
    left: number;
    start: number;
    id: number;
  }
  const pending = new Set<Timer>();
  let held = false;
  const arm = (t: Timer) => {
    t.start = performance.now();
    t.id = window.setTimeout(() => {
      pending.delete(t);
      t.fn();
    }, t.left);
  };
  const later = (fn: () => void, ms: number) => {
    const t = { fn, left: ms, start: 0, id: 0 };
    pending.add(t);
    if (!held) arm(t);
  };

  const layer = document.createElement('div');
  layer.className = 'hd-scene';
  if (slow) {
    layer.style.setProperty('--hd-wobble', '15s');
    layer.style.setProperty('--hd-swing', '3.3s');
  }
  const perch = document.createElement('div');
  perch.className = 'hd-perch';
  const wall = document.createElement('div');
  wall.className = 'hd-wall';
  wall.innerHTML = WALL;
  const egg = document.createElement('div');
  egg.className = 'hd-humpty';
  egg.innerHTML = HUMPTY;
  perch.append(wall, egg);
  const pile = document.createElement('div');
  pile.className = 'hd-pile';
  pile.innerHTML = PILE;
  const party = document.createElement('div');
  party.className = 'hd-party';
  const figs = PARTY.map((kind, i) => {
    const el = document.createElement('div');
    el.className = 'hd-fig';
    el.innerHTML = kind === 'man' ? MAN : HORSE;
    el.style.setProperty('--hd-d', `${i * 120}ms`);
    party.append(el);
    return { el, kind };
  });
  layer.append(perch, pile, party);

  let fallAnim: Animation | null = null;
  let state: 'sitting' | 'fallen' | 'done' = 'sitting';
  let bubble: HTMLElement | null = null;

  // Puts the wall at the end of the first row with room beside its text, bottom on the text's bottom edge.
  const layout = () => {
    const box = wrap.getBoundingClientRect();
    for (const sel of ROWS) {
      const row = wrap.querySelector<HTMLElement>(sel);
      if (!row) continue;
      const range = document.createRange();
      range.selectNodeContents(row);
      const text = range.getBoundingClientRect();
      const r = text.width ? text : row.getBoundingClientRect();
      if (r.right + 12 + WALL_W > box.right) continue;
      perch.style.top = `${r.bottom - box.top - PERCH_H}px`;
      perch.hidden = false;
      return;
    }
    perch.hidden = true;
  };

  // Speech bubble above anchor, kept inside the wrap; replaces any bubble already showing.
  const say = (anchor: HTMLElement, text: string, ms: number, small?: string) => {
    bubble?.remove();
    const b = document.createElement('div');
    b.className = 'hd-bubble' + (small ? ' wide' : '');
    b.textContent = text;
    if (small) {
      const s = document.createElement('small');
      s.textContent = small;
      b.append(s);
    }
    layer.append(b);
    bubble = b;
    const a = anchor.getBoundingClientRect();
    const l = layer.getBoundingClientRect();
    const half = b.offsetWidth / 2;
    const x = a.left + a.width / 2 - l.left;
    b.style.left = `${Math.min(Math.max(x, half), Math.max(half, l.width - half))}px`;
    b.style.top = `${a.top - l.top}px`;
    later(() => {
      b.remove();
      if (bubble === b) bubble = null;
    }, ms);
  };

  const arrive = () => {
    party.classList.add('on');
    figs.forEach((_, i) => {
      later(() => beep(520 + (i % 2) * 140, 50, 'triangle', 0.06), i * 120);
      later(() => beep(420 + (i % 2) * 140, 50, 'triangle', 0.06), i * 120 + 180);
    });
  };

  const fall = () => {
    if (state !== 'sitting') return;
    state = 'fallen';
    found('humpty');
    egg.classList.add('falling');
    egg.removeAttribute('tabindex');
    // Measure the landing spot while the pile is laid out but hidden.
    const from = egg.getBoundingClientRect();
    const to = pile.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + 40 - (from.top + 42);
    const ms = Math.min(500 + Math.max(dy, 0) * 0.6, 1400) * (slow ? 1.4 : 1);
    fallAnim = egg.animate(
      [
        { transform: 'none', easing: 'ease-out' },
        {
          transform: `translate(${dx * 0.15}px,-14px) rotate(25deg)`,
          offset: 0.2,
          easing: 'ease-in',
        },
        { transform: `translate(${dx}px,${dy}px) rotate(160deg)` },
      ],
      { duration: ms, fill: 'forwards' },
    );
    fallAnim.onfinish = () => {
      fallAnim = null;
      egg.hidden = true;
      pile.classList.add('on');
      boom(200, 0.2);
      beep(180, 120, 'triangle', 0.12);
      say(pile, pick(data.fall), 2600);
      later(arrive, 600);
    };
  };

  const lines = { man: deck(data.men), horse: deck(data.horses) };
  const tried = new Set<HTMLElement>();

  const finale = () => {
    state = 'done';
    [392, 370, 349, 330].forEach((f, i) => beep(f, i === 3 ? 700 : 260, 'sawtooth', 0.05, i * 280));
    say(pile, data.finale, 12000, pick(data.facts));
    later(() => {
      party.classList.add('leave');
      later(() => {
        party.classList.remove('on', 'leave');
        say(pile, pick(data.porter), 4000);
      }, 1800);
    }, 12000);
  };

  const attempt = (el: HTMLElement, kind: 'man' | 'horse') => {
    if (state !== 'fallen') return;
    el.classList.remove('try');
    void el.offsetWidth;
    el.classList.add('try');
    say(el, lines[kind](), 2800);
    pile.classList.remove('crumble');
    pile.classList.add('fixing');
    beep(660, 60, 'triangle', 0.06);
    later(() => {
      pile.classList.remove('fixing');
      void pile.offsetWidth;
      pile.classList.add('crumble');
      beep(150, 90, 'square', 0.08);
    }, 450);
    if (tried.has(el)) return;
    tried.add(el);
    if (tried.size === figs.length) later(finale, 2400);
  };

  button(egg, 'Humpty Dumpty, sitting on a wall', fall);
  for (const { el, kind } of figs)
    button(el, kind === 'man' ? "One of the King's men" : "One of the King's horses", () =>
      attempt(el, kind),
    );

  let raf = 0;
  const onResize = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(layout);
  };

  // Waits for fonts and images so the heading is measured at its final size.
  const run = () => {
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    wrap.append(layer);
    layout();
    addEventListener('resize', onResize);
  };
  if (document.readyState === 'complete') run();
  else addEventListener('load', run, { once: true });

  const offPause = onPause(() => {
    held = true;
    layer.classList.add('paused');
    fallAnim?.pause();
    for (const t of pending) {
      clearTimeout(t.id);
      t.left -= performance.now() - t.start;
    }
  });
  const offResume = onResume(() => {
    held = false;
    layer.classList.remove('paused');
    fallAnim?.play();
    pending.forEach(arm);
  });

  return () => {
    offPause();
    offResume();
    removeEventListener('load', run);
    removeEventListener('resize', onResize);
    cancelAnimationFrame(raf);
    pending.forEach((t) => clearTimeout(t.id));
    layer.remove();
    style.remove();
  };
}
