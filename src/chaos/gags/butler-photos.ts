// Every Samuel Butler portrait gets one random transform per element on each load.
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
// Effects that only touch filter/rotate/scale, used for the gallery lightbox image.
const LIGHT_EFFECTS: Effect[] = ['flip', 'hue', 'swirl', 'invert', 'upside-down', 'spin'];

// Eye centres as fractions of the full 900x1182 portrait, and its aspect ratio.
const EYES = [
  [0.428, 0.383],
  [0.56, 0.385],
];
const PORTRAIT_ASPECT = 900 / 1182;
const PIXELS = 20;

const CSS = `
@keyframes bt-spin{to{rotate:360deg}}
.bt-wrap{position:relative;display:inline-block;line-height:0}
.bt-eye{position:absolute;width:13%;aspect-ratio:1;translate:-50% -50%;border-radius:50%;background:#fff;
border:1px solid #000;box-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none}
.bt-pupil{position:absolute;left:50%;top:50%;width:45%;height:45%;margin:-22.5% 0 0 -22.5%;border-radius:50%;
background:#000}
`;

const SWIRL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">
<filter id="bt-swirl"><feTurbulence type="turbulence" baseFrequency="0.015 0.03" numOctaves="2" seed="7"/>
<feDisplacementMap in="SourceGraphic" scale="40" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`;

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export default function butlerPhotos(): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const svgHost = document.createElement('div');
  svgHost.innerHTML = SWIRL_SVG;
  const svg = svgHost.firstElementChild!;
  document.body.append(svg);

  const spinDuration = matchMedia('(prefers-reduced-motion: reduce)').matches ? '60s' : '20s';
  const undo: (() => void)[] = [];
  const eyes: { eye: HTMLElement; pupil: HTMLElement }[] = [];
  const restore = new Map<HTMLImageElement, () => void>();

  // Applies a filter/rotate/scale effect inline, so it beats scoped component styles. Returns its undo.
  function applyLight(img: HTMLImageElement, effect: Effect): () => void {
    const prev = {
      filter: img.style.filter,
      rotate: img.style.rotate,
      scale: img.style.scale,
      anim: img.style.animation,
    };
    const base = getComputedStyle(img).filter;
    const withBase = (f: string) => (base && base !== 'none' ? `${base} ${f}` : f);
    if (effect === 'flip') img.style.scale = '-1 1';
    if (effect === 'upside-down') img.style.rotate = '180deg';
    if (effect === 'hue')
      img.style.filter = withBase(`hue-rotate(${60 + Math.round(Math.random() * 240)}deg)`);
    if (effect === 'invert') img.style.filter = withBase('invert(1)');
    if (effect === 'swirl') img.style.filter = withBase('url(#bt-swirl)');
    if (effect === 'spin') img.style.animation = `bt-spin ${spinDuration} linear infinite`;
    img.dataset.bt = effect;
    return () => {
      img.style.filter = prev.filter;
      img.style.rotate = prev.rotate;
      img.style.scale = prev.scale;
      img.style.animation = prev.anim;
      delete img.dataset.bt;
    };
  }

  // Swaps the image for a tiny canvas copy drawn with hard pixel edges.
  function pixelate(img: HTMLImageElement): () => void {
    const prev = {
      src: img.src,
      srcset: img.srcset,
      sizes: img.sizes,
      rendering: img.style.imageRendering,
    };
    let done = false;
    const run = () => {
      if (done || !img.naturalWidth) return;
      done = true;
      const canvas = document.createElement('canvas');
      canvas.width = PIXELS;
      canvas.height = Math.max(1, Math.round((PIXELS * img.naturalHeight) / img.naturalWidth));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
      img.src = canvas.toDataURL();
      img.style.imageRendering = 'pixelated';
    };
    if (img.complete) run();
    else img.addEventListener('load', run, { once: true });
    img.dataset.bt = 'pixelate';
    return () => {
      img.removeEventListener('load', run);
      if (done) {
        if (prev.srcset) img.srcset = prev.srcset;
        if (prev.sizes) img.sizes = prev.sizes;
        img.src = prev.src;
      }
      img.style.imageRendering = prev.rendering;
      delete img.dataset.bt;
    };
  }

  // Wraps the image and puts two googly eyes over the portrait's eyes.
  function googly(img: HTMLImageElement): () => void {
    const wrap = document.createElement('span');
    wrap.className = 'bt-wrap';
    if (getComputedStyle(img).display === 'block') wrap.style.display = 'block';
    img.replaceWith(wrap);
    wrap.append(img);
    const made = EYES.map(() => {
      const eye = document.createElement('span');
      eye.className = 'bt-eye';
      const pupil = document.createElement('span');
      pupil.className = 'bt-pupil';
      eye.append(pupil);
      wrap.append(eye);
      eyes.push({ eye, pupil });
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
      wrap.replaceWith(img);
      delete img.dataset.bt;
    };
  }

  for (const img of document.querySelectorAll<HTMLImageElement>(SELECTOR)) {
    const effect = pick(EFFECTS);
    if (effect === 'pixelate') undo.push(pixelate(img));
    else if (effect === 'googly') undo.push(googly(img));
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
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = (r.width * 0.27 * Math.min(d, 200)) / 200;
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

  // Spinning portraits stop while a game is open.
  const setPlay = (state: string) => {
    for (const img of document.querySelectorAll<HTMLImageElement>('img[data-bt="spin"]')) {
      img.style.animationPlayState = state;
    }
  };
  const offPause = onPause(() => setPlay('paused'));
  const offResume = onResume(() => setPlay(''));

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
