// Where's Waldo: each day every character hides on one site page, peeking out from behind an element.
// Page, element, edge and offset are seeded by the London date, so everyone gets the same spots.
// Clicking a character opens its daily puzzle.
import { characters, type Character } from './characters';
import { games } from '../../registry';
import { open } from '../../overlay';
import { onPause, onResume } from '../../bus';
import { url } from '../../../lib/url';
import { hash, rng, shuffled, today } from '../../../games/daily/core';

const PAGES = ['/', '/history', '/freshers', '/quick-links', '/events'];
// Block elements a character can stand behind, in DOM order.
const HOSTS =
  'main .card, main .panel, main figure, main h1, main h2, main h3, main .facts, main .strip, main table, main blockquote, main .prose > p';
// Fallback when nothing on the page fits: peek over the top of the footer.
const FALLBACK = '.site-footer';
// Wrapper box: W wide, H tall, with the edge at its bottom.
const W = 40;
const H = 44;

const CSS = `
.wl-peek{position:absolute;width:${W}px;height:${H}px;overflow:hidden;z-index:1;cursor:pointer;transform-origin:50% 100%}
.wl-peek .wl-ch{position:absolute;left:0;top:0;width:${W}px;transform:translateY(9px);
transition:transform .5s cubic-bezier(.3,1.4,.5,1);animation:wl-bob var(--wl-bob,3.2s) ease-in-out infinite}
.wl-peek .wl-ch svg{display:block;width:100%;height:auto}
.wl-peek:hover .wl-ch,.wl-peek:focus-visible .wl-ch{transform:translateY(0)}
.wl-peek.duck .wl-ch{transform:translateY(${H}px);transition-duration:.35s}
.wl-peek.tail .wl-ch{transform:translateY(4px)}
.wl-peek.tail .wl-ch{transform-origin:50% 100%;animation-name:wl-wag;animation-duration:var(--wl-wag,1.4s)}
.wl-peek.paused .wl-ch{animation-play-state:paused}
@keyframes wl-bob{0%,100%{translate:0 0}50%{translate:0 2px}}
@keyframes wl-wag{0%,100%{rotate:-8deg}50%{rotate:8deg}}
.wl-bubble{position:fixed;z-index:2147483001;padding:.45rem .8rem;border:3px solid #161b26;border-radius:1rem;background:#fff;
color:#161b26;font:700 1rem/1.1 'Comic Sans MS','Comic Sans',sans-serif;text-transform:uppercase;pointer-events:none;
transform:translate(-50%,-130%);animation:wl-pop .25s ease-out}
@keyframes wl-pop{0%{transform:translate(-50%,-100%) scale(.5)}100%{transform:translate(-50%,-130%)}}
`;

type Edge = 'top' | 'left' | 'right';

interface Spot {
  host: HTMLElement;
  edge: Edge;
  // Position along the edge, 0-1.
  at: number;
}

const norm = (p: string) => p.replace(/\/$/, '') || '/';

// Rect of the visible peek area beside the host, in page coordinates.
function peekRect(host: HTMLElement, edge: Edge, at: number): DOMRect {
  const r = host.getBoundingClientRect();
  const x = r.left + scrollX;
  const y = r.top + scrollY;
  if (edge === 'top') return new DOMRect(x + r.width * at - W / 2, y - H, W, H);
  if (edge === 'left') return new DOMRect(x - H, y + r.height * at - W / 2, H, W);
  return new DOMRect(x + r.width, y + r.height * at - W / 2, H, W);
}

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function clipped(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') return true;
    if (s.position === 'fixed' || s.position === 'sticky') return true;
  }
  return false;
}

// True when the peek area has no other content in it and stays inside the page width.
function clear(host: HTMLElement, rect: DOMRect, content: HTMLElement[]): boolean {
  if (rect.left < 4 || rect.right > document.documentElement.clientWidth - 4) return false;
  for (const el of content) {
    if (el.contains(host) || host.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (overlaps(rect, new DOMRect(r.left + scrollX, r.top + scrollY, r.width, r.height)))
      return false;
  }
  return true;
}

function usable(host: HTMLElement): boolean {
  if (host.closest('a, button, dialog, header, footer, [data-game], [class^="chaos-"], .wl-host'))
    return false;
  const r = host.getBoundingClientRect();
  if (r.width < 120 || r.height < 40) return false;
  if (clipped(host)) return false;
  // A positioned host is fine; a static host must not hold absolute children that rely on an outer box.
  if (getComputedStyle(host).position === 'static') {
    for (const el of host.querySelectorAll<HTMLElement>('*'))
      if (getComputedStyle(el).position === 'absolute') return false;
  }
  return true;
}

function pickSpot(c: Character, date: string, taken: Set<HTMLElement>): Spot | null {
  const hosts = [...document.querySelectorAll<HTMLElement>(HOSTS)];
  const content = [
    ...document.querySelectorAll<HTMLElement>(
      'main p, main li, main h1, main h2, main h3, main h4, main img, main a, main button, main svg, main iframe, main input, main .card, main figure, .wl-peek',
    ),
  ];
  const r = rng(hash(`${date}:${c.id}:spot`));
  for (const host of shuffled(hosts, hash(`${date}:${c.id}:hosts`))) {
    const edges: Edge[] = shuffled(['top', 'left', 'right'] as Edge[], Math.floor(r() * 1e9));
    const at = 0.15 + r() * 0.7;
    if (taken.has(host) || !usable(host)) continue;
    // Text blocks only get side peeks; their top margin is too small.
    if (host.tagName === 'P') edges.splice(edges.indexOf('top'), 1);
    for (const edge of edges) {
      // Headings are short and wide: only peek over them.
      if (edge !== 'top' && /^H\d$/.test(host.tagName)) continue;
      if (clear(host, peekRect(host, edge, at), content)) return { host, edge, at };
    }
  }
  const footer = document.querySelector<HTMLElement>(FALLBACK);
  if (!footer) return null;
  for (let i = 0; i < 8; i++) {
    const at = 0.1 + r() * 0.8;
    if (clear(footer, peekRect(footer, 'top', at), content))
      return { host: footer, edge: 'top', at };
  }
  return null;
}

interface Placed {
  el: HTMLElement;
  stop: () => void;
  schedule: () => void;
}

function place(c: Character, spot: Spot, slow: boolean): Placed {
  const { host, edge, at } = spot;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.classList.add('wl-host');
  const el = document.createElement('div');
  el.className = 'wl-peek' + (c.tail ? ' tail' : '');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `${c.name} is hiding here`);
  el.dataset.waldo = c.id;
  const ch = document.createElement('div');
  ch.className = 'wl-ch';
  ch.innerHTML = c.svg;
  el.append(ch);
  if (edge === 'top') {
    el.style.left = `calc(${(at * 100).toFixed(1)}% - ${W / 2}px)`;
    el.style.top = `${-H}px`;
  } else {
    el.style.left = edge === 'left' ? `${-W / 2}px` : `calc(100% - ${W / 2}px)`;
    el.style.top = `calc(${(at * 100).toFixed(1)}% - ${H}px)`;
    el.style.transform = `rotate(${edge === 'left' ? -90 : 90}deg)`;
  }
  if (slow) {
    el.style.setProperty('--wl-bob', '9.6s');
    el.style.setProperty('--wl-wag', '4.2s');
  }
  host.append(el);

  // Ducks out of sight now and then.
  let timer = 0;
  const r = rng(hash(c.id + Date.now()));
  const schedule = () => {
    timer = window.setTimeout(
      () => {
        el.classList.add('duck');
        timer = window.setTimeout(
          () => {
            el.classList.remove('duck');
            schedule();
          },
          (slow ? 3 : 1) * (900 + r() * 1400),
        );
      },
      (slow ? 3 : 1) * (8000 + r() * 12000),
    );
  };
  const stop = () => {
    clearTimeout(timer);
    el.classList.remove('duck');
  };
  // The tail only wags.
  if (c.tail) return { el, stop: () => {}, schedule: () => {} };
  schedule();
  return { el, stop, schedule };
}

function found(c: Character, el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = 'wl-bubble';
  bubble.textContent = `You found ${c.name}!`;
  bubble.style.left = `${Math.min(Math.max(r.left + r.width / 2, 90), innerWidth - 90)}px`;
  bubble.style.top = `${Math.max(r.top, 60)}px`;
  document.body.append(bubble);
  setTimeout(() => {
    bubble.remove();
    open(c.slug);
  }, 800);
}

export default function waldo(): (() => void) | void {
  const date = today();
  const here = norm(location.pathname);
  const mine = characters.filter((c) => {
    if (!(c.slug in games)) return false;
    const page = PAGES[Math.floor(rng(hash(`${date}:${c.id}:page`))() * PAGES.length)];
    return norm(url(page)) === here;
  });
  if (!mine.length) return;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const placed: Placed[] = [];

  // Waits for fonts and images so the layout checks see the final page.
  const run = () => {
    const taken = new Set<HTMLElement>();
    for (const c of mine) {
      const spot = pickSpot(c, date, taken);
      if (!spot) continue;
      taken.add(spot.host);
      const p = place(c, spot, slow);
      placed.push(p);
      const go = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        found(c, p.el);
      };
      p.el.addEventListener('click', go);
      p.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') go(e);
      });
    }
  };
  if (document.readyState === 'complete') run();
  else addEventListener('load', run, { once: true });

  const offPause = onPause(() =>
    placed.forEach((p) => {
      p.stop();
      p.el.classList.add('paused');
    }),
  );
  const offResume = onResume(() =>
    placed.forEach((p) => {
      p.el.classList.remove('paused');
      p.schedule();
    }),
  );

  return () => {
    offPause();
    offResume();
    placed.forEach((p) => {
      p.stop();
      p.el.remove();
    });
    style.remove();
  };
}
