// Gravity collapse: reaching the bottom of the page turns the visible blocks into physics bodies that fall and pile
// up on the page bottom. Fallen blocks can be dragged and flung until "Call the Porters" flies them back into place.
import type MatterNS from 'matter-js';
import { isPaused, onPause, onResume } from '../bus';
import { found as foundEgg } from '../eggs';
import { startMatter, type MatterWorld } from '../shared/matter';
import { blip, boom } from '../shared/sfx';

interface Block {
  el: HTMLElement;
  body: MatterNS.Body;
  w: number;
  h: number;
  // Page position of the original's centre.
  home: { x: number; y: number };
}

// Elements taken whole as one body.
const ATOMS =
  'h1,h2,h3,h4,h5,h6,p,li,img,svg,picture,video,canvas,button,input,select,textarea,figure,blockquote,pre,table,dt,dd,label,hr,.card';
// Elements that never fall: chaos UI, fallen clones and their hidden originals.
const SKIP =
  '.sbot,.cap,.pong-crack,.pong-score,.pong-bubble,.chaos-overlay,.rr,.rd-canvas,.rd-bubble,.gv-layer,.gv-gone,.gv-porters,.gv-toast,.eggs-toggle,.eggs-list,script,style,template,noscript,iframe';
// Elements that get no fallback background.
const MEDIA = 'img,svg,picture,video,canvas';
// Logical box properties dropped from a clone root.
const LOGICAL = [
  'inline-size',
  'block-size',
  'min-inline-size',
  'min-block-size',
  'max-inline-size',
  'max-block-size',
].concat(
  ['inset-inline', 'inset-block', 'margin-inline', 'margin-block'].flatMap((p) => [
    `${p}-start`,
    `${p}-end`,
  ]),
);
const MAX_BLOCKS = 160;
const WALL = 400;
// Smallest physics size, so thin rules do not tunnel through the floor.
const MIN_SIZE = 8;
// Max body speed in px per step.
const MAX_SPEED = 30;
// Body speed that counts as a hard landing.
const HARD = 10;
// Pointer travel that turns a press into a drag, in px.
const DRAG_SLOP = 6;
// Delay before scroll position counts, so restored scroll on reload does not collapse the page.
const SETTLE = 1000;
// Flight time of one block back to its home, and the delay between block launches, in ms.
const FLY = 600;
const STAGGER = 15;
const TOAST = 'The Porters have tidied up. Please keep off the grass.';

const CSS = `
.gv-layer{position:absolute;left:0;top:0;overflow:hidden;pointer-events:none}
.gv-gone,.gv-gone *{visibility:hidden!important}
.gv-grabbing,.gv-grabbing *{cursor:grabbing!important;user-select:none!important}
.gv-porters,.gv-toast{position:absolute;left:50%;transform:translateX(-50%);z-index:9;
font:600 .95rem/1.2 var(--sans,system-ui,sans-serif);border-radius:999px;white-space:nowrap;
box-shadow:0 4px 14px rgba(0,0,0,.3)}
.gv-porters{padding:.6rem 1.2rem;border:2px solid var(--accent-light,#ff8a80);background:var(--accent,#e3261c);
color:#fff;cursor:pointer}
.gv-porters:hover{background:var(--accent-dark,#a8190f)}
.gv-toast{padding:.6rem 1.2rem;background:var(--primary,#152b4e);color:#fff;transition:opacity .4s}
`;

const transparent = (c: string) => c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c);

// Copies computed styles onto the clone tree, so it looks the same outside its original context.
function inlineStyles(src: Element, dst: Element) {
  const cs = getComputedStyle(src);
  const st = (dst as HTMLElement).style;
  for (let i = 0; i < cs.length; i++) st.setProperty(cs[i], cs.getPropertyValue(cs[i]));
  // SVG internals are styled by their attributes and can be huge.
  if (src instanceof SVGSVGElement) return;
  for (let i = 0; i < src.children.length; i++) inlineStyles(src.children[i], dst.children[i]);
}

// Nearest opaque background behind el.
function backdrop(el: Element): string {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    if (!transparent(bg)) return bg;
  }
  return '#f6f7fa';
}

// True if el has text and only inline children.
function inlineOnly(el: Element): boolean {
  if (!el.textContent?.trim()) return false;
  for (const c of el.children) {
    if (c.tagName === 'BR') continue;
    if (!getComputedStyle(c).display.startsWith('inline')) return false;
  }
  return true;
}

// Width and center x of an inline-only block shrunk to its text, so full-width headings fall as tight cards.
function tightBox(
  el: HTMLElement,
  r: DOMRect,
  w: number,
): { w: number; cx: number; nowrap: boolean } {
  const full = { w, cx: r.left + r.width / 2, nowrap: false };
  if (el.matches(MEDIA) || !inlineOnly(el)) return full;
  const range = document.createRange();
  range.selectNodeContents(el);
  const t = range.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const pad = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'] as const;
  const tw = Math.ceil(t.width + pad.reduce((n, k) => n + parseFloat(cs[k]), 0)) + 2;
  if (!t.width || tw >= w - 4) return full;
  const lines = new Set([...range.getClientRects()].map((q) => Math.round(q.top)));
  return { w: tw, cx: t.left + t.width / 2, nowrap: lines.size <= 1 };
}

// Collects leaf-ish visible blocks under el, outermost first.
function collect(el: Element, out: HTMLElement[], vw: number, vh: number) {
  if (out.length >= MAX_BLOCKS || el.matches(SKIP)) return;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.position === 'fixed') return;
  if (cs.display !== 'contents') {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return;
    const fits = r.width <= vw && r.height <= vh * 0.9;
    if (
      fits &&
      cs.visibility !== 'hidden' &&
      !el.querySelector('iframe') &&
      (el.matches(ATOMS) || inlineOnly(el))
    ) {
      out.push(el as HTMLElement);
      return;
    }
  }
  for (const c of el.children) collect(c, out, vw, vh);
}

export default function gravity(): (() => void) | void {
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  let layer: HTMLElement | null = null;
  let mw: MatterWorld | null = null;
  let loading: Promise<MatterWorld> | null = null;
  let walls: MatterNS.Body[] = [];
  const blocks: Block[] = [];
  const byEl = new Map<Element, Block>();
  let W = 0;
  let H = 0;
  let raf = 0;
  let lastBoom = 0;
  let wasAtBottom = true;
  let collapsing = false;
  let restoring = false;
  // Set once the porters have tidied up; the page stays put until reload.
  let spent = false;
  let porters: HTMLButtonElement | null = null;
  // Page y of the topmost fallen element below the header, clamped to the header bottom.
  let topY = 0;
  let toast: HTMLElement | null = null;
  let toastTimer = 0;
  let drag: {
    block: Block;
    constraint: MatterNS.Constraint;
    x: number;
    y: number;
    moved: boolean;
  } | null = null;
  // Swallows the click that follows a drag release.
  let swallowClick = false;
  const settled = performance.now() + SETTLE;

  // Document size without the layer, which is sized to match it.
  function measure() {
    if (layer) layer.style.height = '0';
    W = document.documentElement.clientWidth;
    H = document.documentElement.scrollHeight;
    if (layer) {
      layer.style.width = `${W}px`;
      layer.style.height = `${H}px`;
    }
  }

  function atBottom() {
    const doc = document.documentElement;
    return scrollY + innerHeight >= doc.scrollHeight - 4;
  }

  function buildWalls() {
    const { Matter, engine } = mw!;
    Matter.Composite.remove(engine.world, walls);
    const tall = H * 4;
    const opts = { isStatic: true, friction: 0.8 };
    walls = [
      Matter.Bodies.rectangle(W / 2, H + WALL / 2, W + WALL * 2, WALL, opts),
      Matter.Bodies.rectangle(-WALL / 2, H - tall / 2, WALL, tall, opts),
      Matter.Bodies.rectangle(W + WALL / 2, H - tall / 2, WALL, tall, opts),
    ];
    Matter.Composite.add(engine.world, walls);
    // Push blocks back inside a shrunk page.
    for (const b of blocks) {
      const { min, max } = b.body.bounds;
      const dx = max.x > W ? W - max.x - 4 : min.x < 0 ? -min.x + 4 : 0;
      const dy = max.y > H ? H - max.y - 4 : 0;
      if (dx || dy) {
        Matter.Body.translate(b.body, { x: dx, y: dy });
        Matter.Sleeping.set(b.body, false);
      }
    }
  }

  async function world(): Promise<MatterWorld> {
    if (mw) return mw;
    loading ??= startMatter().then((w) => {
      mw = w;
      w.engine.enableSleeping = true;
      if (slow) w.engine.timing.timeScale = 0.5;
      buildWalls();
      w.Matter.Events.on(w.engine, 'beforeUpdate', clampSpeeds);
      w.Matter.Events.on(w.engine, 'collisionStart', onCollide);
      if (isPaused()) w.Matter.Runner.stop(w.runner);
      return w;
    });
    // A failed load is retried on the next collapse.
    loading.catch(() => (loading = null));
    return loading;
  }

  function clampSpeeds() {
    const { Matter } = mw!;
    for (const { body } of blocks) {
      const v = body.velocity;
      const s = Math.hypot(v.x, v.y);
      if (s > MAX_SPEED)
        Matter.Body.setVelocity(body, { x: (v.x / s) * MAX_SPEED, y: (v.y / s) * MAX_SPEED });
    }
  }

  function onCollide(e: MatterNS.IEventCollision<MatterNS.Engine>) {
    const now = performance.now();
    if (now - lastBoom < 250) return;
    for (const { bodyA, bodyB } of e.pairs) {
      if (Math.max(bodyA.speed, bodyB.speed) > HARD) {
        lastBoom = now;
        boom(120, 0.1);
        return;
      }
    }
  }

  // Clones el into the layer at its page position and hides the original.
  function makeClone(el: HTMLElement): {
    clone: HTMLElement;
    w: number;
    h: number;
    x: number;
    y: number;
  } {
    const r = el.getBoundingClientRect();
    const h = el.offsetHeight || r.height;
    const box = tightBox(el, r, el.offsetWidth || r.width);
    const w = box.w;
    const clone = el.cloneNode(true) as HTMLElement;
    inlineStyles(el, clone);
    for (const n of [clone, ...clone.querySelectorAll('[id]')]) n.removeAttribute('id');
    for (const img of clone.querySelectorAll('img')) img.draggable = false;
    if (clone instanceof HTMLImageElement) clone.draggable = false;
    const cs = getComputedStyle(el);
    const st = clone.style;
    // Logical twins of the overrides below would fight them.
    for (const p of LOGICAL) st.removeProperty(p);
    if (!el.matches(MEDIA) && transparent(cs.backgroundColor) && cs.backgroundImage === 'none') {
      st.backgroundColor = backdrop(el);
      st.boxShadow = '0 1px 4px rgba(0,0,0,.18)';
      st.borderRadius = '4px';
    }
    Object.assign(st, {
      position: 'absolute',
      left: '0',
      top: '0',
      right: 'auto',
      bottom: 'auto',
      margin: '0',
      float: 'none',
      boxSizing: 'border-box',
      width: `${w}px`,
      height: `${h}px`,
      maxWidth: 'none',
      maxHeight: 'none',
      translate: 'none',
      rotate: 'none',
      scale: 'none',
      transformOrigin: '50% 50%',
      animation: 'none',
      transition: 'none',
      visibility: 'visible',
      pointerEvents: 'auto',
      touchAction: 'pan-y',
      userSelect: 'none',
      cursor: 'grab',
      zIndex: '9',
      willChange: 'transform',
    });
    if (box.nowrap) st.whiteSpace = 'nowrap';
    clone.classList.add('gv-clone');
    return {
      clone,
      w,
      h,
      x: box.cx + scrollX,
      y: r.top + r.height / 2 + scrollY,
    };
  }

  async function collapse() {
    if (collapsing) return;
    const found: HTMLElement[] = [];
    collect(document.body, found, document.documentElement.clientWidth, innerHeight);
    if (!found.length) return;
    collapsing = true;
    try {
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'gv-layer';
        document.body.append(layer);
      }
      measure();
      const { Matter, engine } = await world();
      buildWalls();
      // Clone everything before hiding anything, so later rects are not affected.
      const made = found.map((el) => ({ el, ...makeClone(el) }));
      const header = document.querySelector('.site-header');
      const below = made.filter((m) => !header?.contains(m.el)).map((m) => m.y - m.h / 2);
      // Kept below the sticky header, which can cover the top of the topmost element.
      const headerBottom = (header?.getBoundingClientRect().bottom ?? 0) + scrollY;
      topY = Math.max(headerBottom, below.length ? Math.min(...below) : 0);
      for (const m of made) {
        m.el.classList.add('gv-gone');
        // Header blocks fall in front of the sticky header, the rest pass under it.
        if (header?.contains(m.el)) m.clone.style.zIndex = '11';
        layer.append(m.clone);
        const body = Matter.Bodies.rectangle(
          m.x,
          m.y,
          Math.max(MIN_SIZE, m.w),
          Math.max(MIN_SIZE, m.h),
          { friction: 0.5, frictionAir: 0.01, restitution: 0.1 },
        );
        Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.04);
        const block = { el: m.clone, body, w: m.w, h: m.h, home: { x: m.x, y: m.y } };
        blocks.push(block);
        byEl.set(m.clone, block);
        Matter.Composite.add(engine.world, body);
        place(block);
      }
      boom(90, 0.2);
      foundEgg('gravity');
      showPorters();
      if (!raf && !isPaused()) raf = requestAnimationFrame(frame);
    } finally {
      collapsing = false;
    }
  }

  // Pins el on the page where the topmost fallen element below the header was.
  function mount(el: HTMLElement) {
    el.style.top = `${topY + 16}px`;
    document.body.append(el);
  }

  function showPorters() {
    if (porters) return;
    porters = document.createElement('button');
    porters.type = 'button';
    porters.className = 'gv-porters';
    porters.textContent = 'Call the Porters';
    porters.addEventListener('click', () => void restore());
    mount(porters);
  }

  function showToast(text: string) {
    clearTimeout(toastTimer);
    toast?.remove();
    toast = document.createElement('div');
    toast.className = 'gv-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = text;
    mount(toast);
    toastTimer = window.setTimeout(() => {
      toast!.style.opacity = '0';
      toastTimer = window.setTimeout(() => (toast?.remove(), (toast = null)), 400);
    }, 3500);
  }

  // Flies every block from its resting place back to its home, last fallen first, then shows the originals again.
  async function restore() {
    if (restoring || collapsing || !mw || !blocks.length) return;
    restoring = true;
    release();
    porters?.remove();
    porters = null;
    const { Matter, engine } = mw;
    cancelAnimationFrame(raf);
    raf = 0;
    Matter.Composite.remove(
      engine.world,
      blocks.map((b) => b.body),
    );
    const flights = [...blocks].reverse().map((b, i) => {
      const { x, y } = b.body.position;
      // Shortest turn back to upright.
      const a = Math.atan2(Math.sin(b.body.angle), Math.cos(b.body.angle));
      return { b, x, y, a, start: i * STAGGER };
    });
    if (!slow) {
      blip();
      await new Promise<void>((done) => {
        const t0 = performance.now();
        const end = flights.length ? flights.at(-1)!.start + FLY : 0;
        function tick(now: number) {
          const t = now - t0;
          for (const f of flights) {
            const k = Math.min(1, Math.max(0, (t - f.start) / FLY));
            const e = 1 - (1 - k) ** 3;
            const x = f.x + (f.b.home.x - f.x) * e;
            const y = f.y + (f.b.home.y - f.y) * e;
            f.b.el.style.transform = `translate(${x - f.b.w / 2}px,${y - f.b.h / 2}px) rotate(${f.a * (1 - e)}rad)`;
          }
          if (t < end) requestAnimationFrame(tick);
          else done();
        }
        requestAnimationFrame(tick);
      });
    }
    for (const b of blocks) b.el.remove();
    blocks.length = 0;
    byEl.clear();
    for (const el of document.querySelectorAll('.gv-gone')) el.classList.remove('gv-gone');
    blip();
    showToast(TOAST);
    restoring = false;
    spent = true;
  }

  function place(b: Block) {
    const { x, y } = b.body.position;
    b.el.style.transform = `translate(${x - b.w / 2}px,${y - b.h / 2}px) rotate(${b.body.angle}rad)`;
  }

  function frame() {
    raf = 0;
    if (isPaused()) return;
    for (const b of blocks) if (!b.body.isSleeping) place(b);
    raf = requestAnimationFrame(frame);
  }

  function onScroll() {
    const bottom = atBottom();
    const arrived = bottom && !wasAtBottom;
    wasAtBottom = bottom;
    if (!arrived || restoring || spent || performance.now() < settled) return;
    if (isPaused() || document.querySelector('.cap')) return;
    collapse().catch((err) => console.error('gravity collapse failed', err));
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || drag || restoring || !mw || isPaused()) return;
    const el = e.target instanceof Element ? e.target.closest('.gv-clone') : null;
    const block = el && byEl.get(el);
    if (!block) return;
    // Stops text selection and native image drags; the click still fires.
    e.preventDefault();
    const { Matter, engine } = mw;
    const x = e.clientX + scrollX;
    const y = e.clientY + scrollY;
    const { body } = block;
    const constraint = Matter.Constraint.create({
      pointA: { x, y },
      bodyB: body,
      pointB: Matter.Vector.rotate({ x: x - body.position.x, y: y - body.position.y }, -body.angle),
      length: 0,
      stiffness: 0.2,
      damping: 0.05,
    });
    Matter.Sleeping.set(body, false);
    Matter.Composite.add(engine.world, constraint);
    drag = { block, constraint, x: e.clientX, y: e.clientY, moved: false };
    document.documentElement.classList.add('gv-grabbing');
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_SLOP && !drag.moved) {
      drag.moved = true;
      blip();
    }
    drag.constraint.pointA = { x: e.clientX + scrollX, y: e.clientY + scrollY };
    mw!.Matter.Sleeping.set(drag.block.body, false);
  }

  function release() {
    if (!drag) return;
    mw!.Matter.Composite.remove(mw!.engine.world, drag.constraint);
    if (drag.moved) swallowClick = true;
    drag = null;
    document.documentElement.classList.remove('gv-grabbing');
  }

  function onPointerUp() {
    release();
    // The click (if any) fires right after pointerup; drop the flag on the next tick otherwise.
    setTimeout(() => (swallowClick = false), 0);
  }

  function onClick(e: MouseEvent) {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onResize() {
    if (!layer) return;
    measure();
    if (mw) buildWalls();
  }

  // Window capture runs before the document-level game and captcha click handlers.
  addEventListener('click', onClick, true);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  const offPause = onPause(() => {
    release();
    if (mw) mw.Matter.Runner.stop(mw.runner);
    cancelAnimationFrame(raf);
    raf = 0;
  });
  const offResume = onResume(() => {
    if (!mw) return;
    mw.Matter.Runner.run(mw.runner, mw.engine);
    if (blocks.length && !restoring) raf = requestAnimationFrame(frame);
  });

  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('click', onClick, true);
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    offPause();
    offResume();
    document.documentElement.classList.remove('gv-grabbing');
    for (const el of document.querySelectorAll('.gv-gone')) el.classList.remove('gv-gone');
    clearTimeout(toastTimer);
    porters?.remove();
    toast?.remove();
    mw?.stop();
    layer?.remove();
    style.remove();
  };
}
