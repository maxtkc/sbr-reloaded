// Star Wars crawl: the whole Freshers' Guide on a receding 3D plane, one episode per chapter.
import guide from '../../data/guide.md?raw';
import { beep, blip, fanfare } from '../../chaos/shared/sfx';
import { render } from './markdown';
import data from './data.json';

const YELLOW = '#ffe81f';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
// Plane tilt, and perspective as a fraction of the stage height.
const TILT = (25 * Math.PI) / 180;
const PERSPECTIVE = 0.6;
// Intro timings in seconds: opening line, then the logo, with the crawl starting as the logo recedes.
const OPENING_END = 4.5;
const LOGO_END = 11;
const CRAWL_START = 8;
// Base crawl speed in em per second.
const BASE_SPEED = 2;

const CSS = `
.sw{position:absolute;inset:0;overflow:hidden;background:#000;color:${YELLOW};outline:none;
  font-family:"Franklin Gothic Medium","Arial Narrow",Arial,sans-serif;user-select:none;-webkit-user-select:none;
  touch-action:none;cursor:pointer}
.sw canvas{position:absolute;inset:0;width:100%;height:100%}
.sw-opening{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 8%;
  color:#4bd5ee;font-size:clamp(18px,3.4vw,40px);line-height:1.4;text-align:left;opacity:0;pointer-events:none}
.sw-logo{position:absolute;left:50%;top:50%;text-align:center;line-height:.9;font-weight:900;white-space:nowrap;
  color:#000;-webkit-text-stroke:.03em ${YELLOW};opacity:0;pointer-events:none;font-family:Impact,"Arial Black",sans-serif}
.sw-logo small{display:block;font-size:.22em;letter-spacing:.15em;color:${YELLOW};-webkit-text-stroke:0;
  margin-bottom:.4em;font-family:"Franklin Gothic Medium",Arial,sans-serif}
.sw-logo b{display:block;font-size:1em;letter-spacing:.04em}
.sw-logo span{display:block;font-size:.4em;margin-top:.15em}
.sw-stage{position:absolute;inset:0;overflow:hidden;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 35%);mask-image:linear-gradient(to bottom,transparent 0,#000 35%)}
.sw-text{position:absolute;top:100%;left:50%;width:min(90%,22em);margin-left:calc(min(90%,22em)/-2);
  transform-origin:50% 0;font-size:clamp(17px,2.8vw,36px);line-height:1.35;text-align:justify;font-weight:600;
  visibility:hidden}
.sw-text h2,.sw-text h3,.sw-text h4,.sw-text h5{text-align:center;margin:1.6em 0 .6em;line-height:1.15}
.sw-text h3{font-size:1.25em}
.sw-text h4{font-size:1.1em}
.sw-text h5{font-size:1em}
.sw-text p{margin:0 0 1em}
.sw-text ul,.sw-text ol{margin:0 0 1em;padding-left:1.4em;text-align:left}
.sw-text li{margin-bottom:.4em}
.sw-text li.check{list-style:none}
.sw-text li.check::before{content:"";display:inline-block;width:.7em;height:.7em;border:.1em solid ${YELLOW};
  margin:0 .45em 0 -1.2em;vertical-align:-.05em}
.sw-text table{width:100%;border-collapse:collapse;margin:0 0 1em;text-align:left;font-size:.85em}
.sw-text th,.sw-text td{border:.08em solid ${YELLOW};padding:.25em .4em}
.sw-text .link{text-decoration:underline}
.sw-ep{text-align:center;margin-top:6em}
.sw-ep:first-child{margin-top:0}
.sw-ep p{margin:0;font-size:1.1em;letter-spacing:.05em}
.sw-ep h2{font-size:2em;margin:.3em 0 1em;text-transform:uppercase}
.sw-end{text-align:center;margin-top:8em}
.sw-end p:first-child{font-size:2.4em;font-weight:900}
.sw-label{position:absolute;left:.75rem;top:.6rem;font-size:13px;color:${YELLOW};opacity:.85;pointer-events:none;
  text-shadow:0 0 4px #000}
.sw-hint{position:absolute;left:0;right:0;bottom:0;padding:.5rem;text-align:center;font-size:13px;color:#ddd;
  opacity:.7;pointer-events:none;background:linear-gradient(transparent,rgba(0,0,0,.85) 40%)}
`;

interface Episode {
  title: string;
  body: string;
}

function episodes(md: string): Episode[] {
  return md
    .split(/^## /m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      return { title: chunk.slice(0, nl).trim(), body: chunk.slice(nl + 1) };
    });
}

function h(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export default function start(root: HTMLElement): () => void {
  const sw = h('div', 'sw');
  sw.tabIndex = -1;
  const style = h('style');
  style.textContent = CSS;
  const canvas = document.createElement('canvas');
  const opening = h('div', 'sw-opening', data.opening);
  const logo = h('div', 'sw-logo');
  logo.append(h('small', '', data.logoSmall), h('b', '', data.logo), h('span', '', data.logoYear));
  const stage = h('div', 'sw-stage');
  const text = h('div', 'sw-text');
  stage.append(text);
  const label = h('div', 'sw-label');
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const hint = h('div', 'sw-hint', touch ? data.touchHint : data.hint);
  sw.append(style, canvas, stage, opening, logo, label, hint);
  root.append(sw);

  // Crawl text: an episode header per chapter, then its body, then the end card.
  const eps = episodes(guide as string);
  const subs = data.episodes as Record<string, string>;
  const headers: HTMLElement[] = [];
  eps.forEach((ep, i) => {
    const head = h('section', 'sw-ep');
    head.append(
      h('p', '', `Episode ${ROMAN[i] ?? i + 1}: ${ep.title}`),
      h('h2', '', subs[ep.title] ?? ep.title),
    );
    headers.push(head);
    text.append(head, render(ep.body));
  });
  const end = h('section', 'sw-end');
  for (const line of data.end) end.append(h('p', '', line));
  text.append(end);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  let W = 0;
  let H = 0;
  let em = 16;
  let offsets: number[] = [];
  let total = 0;

  // Distance along the plane whose screen position is y px above the stage bottom.
  const along = (y: number) => y / (Math.cos(TILT) - (y * Math.sin(TILT)) / (H * PERSPECTIVE));

  function drawStars(): void {
    const dpr = devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const c = canvas.getContext('2d');
    if (!c) return;
    c.fillStyle = '#fff';
    const n = Math.round((W * H) / 2500);
    for (let i = 0; i < n; i++) {
      const r = Math.random() < 0.08 ? 1.4 : 0.7;
      c.globalAlpha = 0.3 + Math.random() * 0.7;
      c.beginPath();
      c.arc(Math.random() * W * dpr, Math.random() * H * dpr, r * dpr, 0, Math.PI * 2);
      c.fill();
    }
  }

  function measure(): void {
    W = sw.clientWidth;
    H = sw.clientHeight;
    if (!W || !H) return;
    stage.style.perspective = `${H * PERSPECTIVE}px`;
    em = parseFloat(getComputedStyle(text).fontSize) || 16;
    offsets = headers.map((e) => e.offsetTop);
    // The crawl ends once the end card has left the top of the stage.
    total = text.offsetHeight + along(H * 0.98);
    logo.style.fontSize = `${Math.min(W * 0.12, H * 0.2)}px`;
    drawStars();
  }

  // Intro and crawl state. Speed is a multiple of BASE_SPEED.
  let t = 0;
  let pos = 0;
  let mult = 1;
  let burst = 0;
  let paused = false;
  let holding = false;
  let holdT = 0;
  let fanfared = false;
  let raf = 0;
  let last = performance.now();

  const crawling = () => t >= CRAWL_START;

  // Puts episode i's header just below the middle of the stage.
  function goTo(i: number): void {
    const n = Math.max(0, Math.min(offsets.length - 1, i));
    pos = Math.max(0, offsets[n] + along(H * 0.45));
    t = Math.max(t, LOGO_END);
    blip();
  }

  function current(): number {
    const read = pos - along(H * 0.45) + 1;
    let i = 0;
    offsets.forEach((o, j) => {
      if (o <= read) i = j;
    });
    return i;
  }

  function skipIntro(): void {
    if (t < LOGO_END) {
      t = LOGO_END;
      // Start with the first episode header already on screen.
      pos = Math.max(pos, along(H * 0.3));
    }
  }

  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) t += dt;
    if (holding) holdT += dt;
    burst *= Math.exp(-1.5 * dt);

    // Opening line fades in, holds, fades out.
    opening.style.opacity = String(t < OPENING_END ? Math.min(1, t, OPENING_END - t) : 0);

    // Logo shrinks from oversized to nothing, fading at the end.
    if (t >= OPENING_END && t < LOGO_END) {
      if (!fanfared) {
        fanfared = true;
        fanfare();
      }
      const k = (t - OPENING_END) / (LOGO_END - OPENING_END);
      const scale = 1.1 * Math.pow(1 - k, 2.2) + 0.001;
      logo.style.opacity = String(Math.min(1, (1 - k) * 4));
      logo.style.transform = `translate(-50%,-50%) scale(${scale})`;
    } else {
      logo.style.opacity = '0';
    }

    if (crawling()) {
      const hold = holding && holdT > 0.25 ? 6 : 0;
      const speed = paused && !holding ? 0 : BASE_SPEED * em * slow * (mult + burst + hold);
      pos = Math.max(0, pos + speed * dt);
      text.style.visibility = 'visible';
      text.style.transform = `rotateX(${TILT}rad) translateY(${-pos}px)`;
      const i = current();
      const sign = mult < 0 ? '-' : '';
      label.textContent = `Episode ${ROMAN[i] ?? i + 1}: ${eps[i]?.title ?? ''}  (${sign}x${Math.abs(mult).toFixed(1)}${paused ? ', paused' : ''})`;
      if (total && pos > total) restart();
    } else {
      text.style.visibility = 'hidden';
      label.textContent = '';
    }
    raf = requestAnimationFrame(frame);
  }

  // Loops back to the opening line.
  function restart(): void {
    t = 0;
    pos = 0;
    mult = 1;
    fanfared = false;
  }

  function changeSpeed(d: number): void {
    mult = Math.max(-4, Math.min(12, Math.round((mult + d) * 4) / 4));
    beep(mult >= 0 ? 440 + mult * 40 : 300, 40, 'square', 0.05);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return;
    // Any key during the intro skips it.
    if (t < LOGO_END) {
      if (e.key === 'Tab' || e.key === 'Shift') return;
      skipIntro();
      e.preventDefault();
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'arrowup') changeSpeed(0.5);
    else if (key === 'arrowdown') changeSpeed(-0.5);
    else if (key === 'arrowright' || key === 'pagedown' || key === 'n') goTo(current() + 1);
    else if (key === 'arrowleft' || key === 'pageup' || key === 'p') {
      // Back to the start of this episode first, then the previous one.
      const i = current();
      goTo(pos - (offsets[i] + along(H * 0.45)) > em * 4 ? i : i - 1);
    } else if (key === ' ') paused = !paused;
    else return;
    e.preventDefault();
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (t < LOGO_END) return skipIntro();
    changeSpeed(e.deltaY > 0 ? 0.25 : -0.25);
  }

  function onDown(): void {
    sw.focus();
    if (t < LOGO_END) return skipIntro();
    holding = true;
    holdT = 0;
  }

  function onUp(): void {
    if (!holding) return;
    // A short press is a tap: a burst of speed that decays.
    if (holdT <= 0.25) {
      burst = Math.min(burst + 4, 16);
      blip();
    }
    holding = false;
  }

  addEventListener('keydown', onKey);
  sw.addEventListener('wheel', onWheel, { passive: false });
  sw.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  const ro = new ResizeObserver(measure);
  ro.observe(sw);
  measure();
  sw.focus();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('keydown', onKey);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    sw.remove();
  };
}
