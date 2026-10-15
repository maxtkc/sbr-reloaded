// Every Samuel Butler portrait gets one random transform per element on each load, looping in and out.
import { onPause, onResume } from '../bus';

const SELECTOR = 'img[alt*="Samuel Butler"]';
const EFFECTS = [
  'flip',
  'hue',
  'swirl',
  'invert',
  'upside-down',
  'googly',
  'spin',
  'pixelate',
] as const;
type Effect = (typeof EFFECTS)[number];
// CSS-only effects, used for the gallery lightbox image.
const LIGHT_EFFECTS: Effect[] = ['flip', 'hue', 'invert', 'upside-down', 'spin'];
const KEYFRAMES: Partial<Record<Effect, string>> = {
  flip: 'bt-flip',
  hue: 'bt-hue',
  invert: 'bt-invert',
  'upside-down': 'bt-upside',
  spin: 'bt-spin',
};

// Eye centres as fractions of the full 900x1182 portrait, and its aspect ratio.
const EYES = [
  [0.428, 0.383],
  [0.56, 0.385],
];
const PORTRAIT_ASPECT = 900 / 1182;
const PIXEL_WIDTHS = [48, 28, 16, 10];

// Loop shape: plain, ease in, hold, ease out, plain.
const CSS = `
@keyframes bt-spin{to{rotate:360deg}}
@keyframes bt-flip{0%,15%,90%,100%{scale:1 1}40%,65%{scale:-1 1}}
@keyframes bt-upside{0%,15%,90%,100%{rotate:0deg}40%,65%{rotate:180deg}}
@keyframes bt-hue{0%,15%{filter:var(--bt-base) hue-rotate(0deg)}90%,100%{filter:var(--bt-base) hue-rotate(360deg)}}
@keyframes bt-invert{0%,15%,90%,100%{filter:var(--bt-base) invert(0)}40%,65%{filter:var(--bt-base) invert(1)}}
@keyframes bt-pop{0%,15%,90%,100%{scale:0}32%{scale:1.25}40%,65%{scale:1}}
.bt-wrap{position:relative;display:inline-block;line-height:0}
.bt-eye{position:absolute;width:13%;aspect-ratio:1;translate:-50% -50%;scale:0;border-radius:50%;background:#fff;
border:1px solid #000;box-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none}
.bt-pupil{position:absolute;left:50%;top:50%;width:45%;height:45%;margin:-22.5% 0 0 -22.5%;border-radius:50%;
background:#000}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export default function butlerPhotos(): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  document.body.append(svg);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 3 : 1;
  const undo: (() => void)[] = [];
  const eyes: { eye: HTMLElement; pupil: HTMLElement }[] = [];
  const animated = new Set<HTMLElement>();
  const timers = new Set<{ start: () => void; stop: () => void }>();
  const restore = new Map<HTMLImageElement, () => void>();
  let paused = false;
  let swirls = 0;

  // Random cycle length and phase, so portraits are out of sync.
  function timing() {
    const dur = (7 + Math.random() * 4) * slow;
    return { dur, delay: -Math.random() * dur };
  }

  // Runs a keyframe loop inline on el. Returns its undo.
  function loop(el: HTMLElement, name: string, dur: number, delay: number): () => void {
    const prev = el.style.animation;
    const ease = name === 'bt-spin' ? 'linear' : 'ease-in-out';
    el.style.animation = `${name} ${dur}s ${ease} ${delay}s infinite`;
    if (paused) el.style.animationPlayState = 'paused';
    animated.add(el);
    return () => {
      el.style.animation = prev;
      animated.delete(el);
    };
  }

  // Applies a CSS keyframe effect, keeping the element's own filter (the stand-in sepia) in front.
  function applyLight(img: HTMLImageElement, effect: Effect): () => void {
    const base = getComputedStyle(img).filter;
    img.style.setProperty('--bt-base', base && base !== 'none' ? base : 'opacity(1)');
    const { dur, delay } = timing();
    // Spin keeps its old slow pace.
    const stop = loop(img, KEYFRAMES[effect]!, effect === 'spin' ? 20 * slow : dur, delay);
    img.dataset.bt = effect;
    return () => {
      stop();
      img.style.removeProperty('--bt-base');
      delete img.dataset.bt;
    };
  }

  // Gives the image its own displacement filter whose strength rises and falls.
  function swirl(img: HTMLImageElement): () => void {
    const id = `bt-swirl-${swirls++}`;
    const { dur, delay } = timing();
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = id;
    filter.innerHTML = `<feTurbulence type="turbulence" baseFrequency="0.015 0.03" numOctaves="2" seed="7"/>
<feDisplacementMap in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G">
<animate attributeName="scale" values="0;0;40;40;0;0" keyTimes="0;.15;.4;.65;.9;1" calcMode="spline"
keySplines="0 0 1 1;.42 0 .58 1;0 0 1 1;.42 0 .58 1;0 0 1 1" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>
</feDisplacementMap>`;
    svg.append(filter);
    const prev = img.style.filter;
    const base = getComputedStyle(img).filter;
    img.style.filter = `${base && base !== 'none' ? `${base} ` : ''}url(#${id})`;
    img.dataset.bt = 'swirl';
    return () => {
      img.style.filter = prev;
      filter.remove();
      delete img.dataset.bt;
    };
  }

  // Steps the image down to a few pixels and back up, using prerendered canvas copies.
  function pixelate(img: HTMLImageElement): () => void {
    const orig = { src: img.src, srcset: img.srcset, sizes: img.sizes };
    const prevRendering = img.style.imageRendering;
    let frames: (string | null)[] = [];
    let holds: number[] = [];
    let i = 0;
    let timer = 0;
    const show = (url: string | null) => {
      if (url) {
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = url;
      } else {
        if (orig.srcset) img.srcset = orig.srcset;
        if (orig.sizes) img.sizes = orig.sizes;
        img.src = orig.src;
      }
    };
    const step = () => {
      i = (i + 1) % frames.length;
      show(frames[i]);
      timer = window.setTimeout(step, holds[i]);
    };
    const ctl = {
      start: () => {
        if (frames.length && !timer) timer = window.setTimeout(step, holds[i]);
      },
      stop: () => {
        clearTimeout(timer);
        timer = 0;
      },
    };
    const prepare = () => {
      if (frames.length || !img.naturalWidth) return;
      const urls = PIXEL_WIDTHS.map((w) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL();
      });
      // original, coarser steps, hold at the coarsest, finer steps.
      frames = [null, ...urls, ...urls.slice(0, -1).reverse()];
      const { dur } = timing();
      const between = (dur * 450) / (frames.length - 2);
      holds = frames.map((f, n) =>
        f === null ? dur * 300 : n === urls.length ? dur * 250 : between,
      );
      i = Math.floor(Math.random() * frames.length);
      show(frames[i]);
      img.style.imageRendering = 'pixelated';
      if (!paused) ctl.start();
    };
    if (img.complete) prepare();
    else img.addEventListener('load', prepare, { once: true });
    timers.add(ctl);
    img.dataset.bt = 'pixelate';
    return () => {
      ctl.stop();
      timers.delete(ctl);
      img.removeEventListener('load', prepare);
      if (frames.length) show(null);
      img.style.imageRendering = prevRendering;
      delete img.dataset.bt;
    };
  }

  // Wraps the image and pops two googly eyes in and out over the portrait's eyes.
  function googly(img: HTMLImageElement): () => void {
    const wrap = document.createElement('span');
    wrap.className = 'bt-wrap';
    if (getComputedStyle(img).display === 'block') wrap.style.display = 'block';
    img.replaceWith(wrap);
    wrap.append(img);
    const { dur, delay } = timing();
    const made = EYES.map(() => {
      const eye = document.createElement('span');
      eye.className = 'bt-eye';
      const pupil = document.createElement('span');
      pupil.className = 'bt-pupil';
      eye.append(pupil);
      wrap.append(eye);
      eyes.push({ eye, pupil });
      loop(eye, 'bt-pop', dur, delay);
      return eye;
    });
    // Maps eye positions through the centre crop to the rendered box's aspect.
    const place = () => {
      const w = img.clientWidth || img.naturalWidth;
      const h = img.clientHeight || img.naturalHeight;
      const aspect = w && h ? w / h : PORTRAIT_ASPECT;
      made.forEach((eye, i) => {
        let [x, y] = EYES[i];
        let size = 13;
        if (aspect > PORTRAIT_ASPECT) {
          const f = PORTRAIT_ASPECT / aspect;
          y = (y - (1 - f) / 2) / f;
        } else {
          const f = aspect / PORTRAIT_ASPECT;
          x = (x - (1 - f) / 2) / f;
          size /= f;
        }
        eye.style.left = `${x * 100}%`;
        eye.style.top = `${y * 100}%`;
        eye.style.width = `${size}%`;
      });
    };
    place();
    img.addEventListener('load', place);
    img.dataset.bt = 'googly';
    return () => {
      img.removeEventListener('load', place);
      made.forEach((eye) => animated.delete(eye));
      wrap.replaceWith(img);
      delete img.dataset.bt;
    };
  }

  for (const img of document.querySelectorAll<HTMLImageElement>(SELECTOR)) {
    const effect = pick(EFFECTS);
    if (effect === 'pixelate') undo.push(pixelate(img));
    else if (effect === 'googly') undo.push(googly(img));
    else if (effect === 'swirl') undo.push(swirl(img));
    else undo.push(applyLight(img, effect));
  }

  // Pupils look toward the pointer.
  let frame = 0;
  let px = 0;
  let py = 0;
  function look() {
    frame = 0;
    for (const { eye, pupil } of eyes) {
      const r = eye.getBoundingClientRect();
      if (!r.width) continue;
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = (eye.offsetWidth * 0.27 * Math.min(d, 200)) / 200;
      pupil.style.translate = `${(dx / d) * reach}px ${(dy / d) * reach}px`;
    }
  }
  function onMove(e: PointerEvent) {
    px = e.clientX;
    py = e.clientY;
    if (!frame) frame = requestAnimationFrame(look);
  }
  if (eyes.length) addEventListener('pointermove', onMove, { passive: true });

  // The lightbox image is reused for every photo: give it an effect only while it shows Butler.
  const observer = new MutationObserver((records) => {
    for (const { target } of records) {
      if (!(target instanceof HTMLImageElement) || !target.closest('.lightbox')) continue;
      restore.get(target)?.();
      restore.delete(target);
      if (target.matches(SELECTOR)) restore.set(target, applyLight(target, pick(LIGHT_EFFECTS)));
    }
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['alt'] });

  // Every loop stops while a game is open.
  function setPaused(value: boolean) {
    paused = value;
    for (const el of animated) el.style.animationPlayState = value ? 'paused' : '';
    if (value) svg.pauseAnimations();
    else svg.unpauseAnimations();
    for (const t of timers) (value ? t.stop : t.start)();
  }
  const offPause = onPause(() => setPaused(true));
  const offResume = onResume(() => setPaused(false));

  return () => {
    observer.disconnect();
    offPause();
    offResume();
    removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
    restore.forEach((fn) => fn());
    undo.forEach((fn) => fn());
    svg.remove();
    style.remove();
  };
}
