// Ragdoll: every 3 minutes on a page a committee ragdoll drops from the top of the viewport. Dolls pile up on the
// viewport bottom and can be grabbed and flung.
import type MatterNS from 'matter-js';
import { isPaused, onPause, onResume } from '../bus';
import { startMatter, type MatterWorld } from '../shared/matter';
import { blip, boom } from '../shared/sfx';

interface Data {
  arrivals: string[];
  grabbed: string[];
  flung: string[];
}

interface Member {
  name: string;
  face: string;
}

interface Doll {
  member: Member;
  img: HTMLImageElement;
  composite: MatterNS.Composite;
  head: MatterNS.Body;
  // Parts in draw order (head last).
  parts: { body: MatterNS.Body; fill: string }[];
  landed: boolean;
}

// Seconds on the page between drops.
const INTERVAL = 180;
const MAX_DOLLS = 5;
const HEAD = 22;
const WALL = 200;
// Max part speed in px per step, so flung dolls do not tunnel through walls.
const MAX_SPEED = 40;
// Part speed that counts as a fling or a hard landing.
const HARD = 14;

const RED = '#a3162b';
const BLUE = '#1f3d7a';
const GOLD = '#d1b948';
const INK = '#1d1a17';

const CSS = `
.rd-canvas{position:fixed;inset:0;z-index:2147480500;pointer-events:none;display:none}
.rd-bubble{position:fixed;z-index:2147480600;pointer-events:none;max-width:14rem;background:#fff;color:#1d1a17;
font:400 .85rem/1.3 var(--sans,system-ui,sans-serif);border:2px solid var(--red,#a3162b);border-radius:.6rem;
padding:.4rem .6rem;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.rd-grab,.rd-grab *{cursor:grab!important}
.rd-grabbing,.rd-grabbing *{cursor:grabbing!important;user-select:none!important}
`;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function readJson<T>(id: string): T | null {
  const text = document.getElementById(id)?.textContent;
  return text ? (JSON.parse(text) as T) : null;
}

export default function ragdoll(): (() => void) | void {
  const data = readJson<Data>('ragdoll-data');
  const roster = readJson<Member[]>('roster-data');
  if (!data || !roster?.length) return;
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const canvas = document.createElement('canvas');
  canvas.className = 'rd-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;
  document.body.append(canvas);

  let W = 0;
  let H = 0;
  function resizeCanvas() {
    W = document.documentElement.clientWidth;
    H = document.documentElement.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();

  let mw: MatterWorld | null = null;
  let loading: Promise<MatterWorld> | null = null;
  let walls: MatterNS.Body[] = [];
  const dolls: Doll[] = [];
  let seconds = 0;
  let raf = 0;
  let lastBoom = 0;
  let bubble: { el: HTMLElement; doll: Doll; timer: number } | null = null;
  let drag: { doll: Doll; part: MatterNS.Body; constraint: MatterNS.Constraint } | null = null;
  // Swallows the click that follows a drag release.
  let swallowClick = false;

  function buildWalls() {
    const { Matter, engine } = mw!;
    Matter.Composite.remove(engine.world, walls);
    const tall = H * 8;
    const opts = { isStatic: true, friction: 0.8 };
    walls = [
      Matter.Bodies.rectangle(W / 2, H + WALL / 2, W + WALL * 2, WALL, opts),
      Matter.Bodies.rectangle(-WALL / 2, H - tall / 2, WALL, tall, opts),
      Matter.Bodies.rectangle(W + WALL / 2, H - tall / 2, WALL, tall, opts),
    ];
    Matter.Composite.add(engine.world, walls);
    // Lift dolls that ended up below a shrunk floor.
    for (const d of dolls) {
      const bottom = Math.max(...d.parts.map((p) => p.body.bounds.max.y));
      if (bottom > H) Matter.Composite.translate(d.composite, { x: 0, y: H - bottom - 10 });
      const cx = d.head.position.x;
      if (cx > W) Matter.Composite.translate(d.composite, { x: W - cx - 40, y: 0 });
    }
  }

  async function world(): Promise<MatterWorld> {
    if (mw) return mw;
    loading ??= startMatter().then((w) => {
      mw = w;
      if (slow) w.engine.timing.timeScale = 0.5;
      buildWalls();
      w.Matter.Events.on(w.engine, 'beforeUpdate', clampSpeeds);
      w.Matter.Events.on(w.engine, 'collisionStart', onCollide);
      if (isPaused()) w.Matter.Runner.stop(w.runner);
      return w;
    });
    return loading;
  }

  function clampSpeeds() {
    const { Matter } = mw!;
    for (const d of dolls) {
      for (const { body } of d.parts) {
        const v = body.velocity;
        const s = Math.hypot(v.x, v.y);
        if (s > MAX_SPEED)
          Matter.Body.setVelocity(body, { x: (v.x / s) * MAX_SPEED, y: (v.y / s) * MAX_SPEED });
      }
    }
  }

  function dollOf(body: MatterNS.Body): Doll | undefined {
    return dolls.find((d) => d.parts.some((p) => p.body === body));
  }

  function onCollide(e: MatterNS.IEventCollision<MatterNS.Engine>) {
    for (const { bodyA, bodyB } of e.pairs) {
      for (const body of [bodyA, bodyB]) {
        const d = dollOf(body);
        if (!d) continue;
        if (!d.landed) {
          d.landed = true;
          say(pick(data!.arrivals), d);
        }
        const now = performance.now();
        if (body.speed > HARD && now - lastBoom > 300) {
          lastBoom = now;
          boom(150, 0.15);
        }
      }
    }
  }

  // Builds a doll whose torso is centered at (x, y).
  function makeDoll(x: number, y: number): Doll {
    const { Matter } = mw!;
    const { Bodies, Constraint, Composite, Body } = Matter;
    const group = Body.nextGroup(true);
    const opts = (extra: MatterNS.IChamferableBodyDefinition = {}) => ({
      collisionFilter: { group },
      friction: 0.6,
      frictionAir: 0.01,
      restitution: 0.15,
      chamfer: { radius: 5 },
      ...extra,
    });
    const head = Bodies.circle(x, y - 28 - HEAD - 2, HEAD, {
      ...opts(),
      chamfer: undefined,
      density: 0.002,
    });
    const torso = Bodies.rectangle(x, y, 32, 56, opts({ chamfer: { radius: 8 } }));
    const limb = (cx: number, cy: number, w: number, h: number) =>
      Bodies.rectangle(cx, cy, w, h, opts());
    const upperL = limb(x - 21, y - 10, 10, 28);
    const upperR = limb(x + 21, y - 10, 10, 28);
    const lowerL = limb(x - 21, y + 17, 9, 26);
    const lowerR = limb(x + 21, y + 17, 9, 26);
    const thighL = limb(x - 8, y + 44, 12, 32);
    const thighR = limb(x + 8, y + 44, 12, 32);
    const shinL = limb(x - 8, y + 75, 11, 30);
    const shinR = limb(x + 8, y + 75, 11, 30);
    const join = (
      bodyA: MatterNS.Body,
      pointA: MatterNS.Vector,
      bodyB: MatterNS.Body,
      pointB: MatterNS.Vector,
    ) => Constraint.create({ bodyA, pointA, bodyB, pointB, length: 0, stiffness: 0.7 });
    const constraints = [
      join(head, { x: 0, y: HEAD }, torso, { x: 0, y: -28 }),
      join(torso, { x: -16, y: -24 }, upperL, { x: 0, y: -14 }),
      join(torso, { x: 16, y: -24 }, upperR, { x: 0, y: -14 }),
      join(upperL, { x: 0, y: 14 }, lowerL, { x: 0, y: -13 }),
      join(upperR, { x: 0, y: 14 }, lowerR, { x: 0, y: -13 }),
      join(torso, { x: -8, y: 28 }, thighL, { x: 0, y: -16 }),
      join(torso, { x: 8, y: 28 }, thighR, { x: 0, y: -16 }),
      join(thighL, { x: 0, y: 16 }, shinL, { x: 0, y: -15 }),
      join(thighR, { x: 0, y: 16 }, shinR, { x: 0, y: -15 }),
    ];
    const parts = [
      { body: thighL, fill: BLUE },
      { body: thighR, fill: BLUE },
      { body: shinL, fill: INK },
      { body: shinR, fill: INK },
      { body: torso, fill: RED },
      { body: upperL, fill: RED },
      { body: upperR, fill: RED },
      { body: lowerL, fill: RED },
      { body: lowerR, fill: RED },
      { body: head, fill: RED },
    ];
    const composite = Composite.create();
    Composite.add(composite, [...parts.map((p) => p.body), ...constraints]);
    const member = pick(roster!);
    const img = new Image();
    img.src = member.face;
    return { member, img, composite, head, parts, landed: false };
  }

  async function drop() {
    const { Matter, engine } = await world();
    const doll = makeDoll(60 + Math.random() * Math.max(0, W - 120), -140);
    Matter.Body.setAngularVelocity(doll.parts[4].body, (Math.random() - 0.5) * 0.1);
    Matter.Composite.add(engine.world, doll.composite);
    dolls.push(doll);
    if (dolls.length > MAX_DOLLS) remove(dolls[0]);
    canvas.style.display = 'block';
    if (!raf && !isPaused()) raf = requestAnimationFrame(frame);
  }

  function remove(d: Doll) {
    if (drag?.doll === d) release();
    if (bubble?.doll === d) hideBubble();
    mw!.Matter.Composite.remove(mw!.engine.world, d.composite);
    dolls.splice(dolls.indexOf(d), 1);
  }

  function hideBubble() {
    if (!bubble) return;
    clearTimeout(bubble.timer);
    bubble.el.remove();
    bubble = null;
  }

  function say(text: string, doll: Doll) {
    hideBubble();
    const el = document.createElement('div');
    el.className = 'rd-bubble';
    el.textContent = text;
    if (isPaused()) el.style.display = 'none';
    document.body.append(el);
    bubble = { el, doll, timer: window.setTimeout(hideBubble, 3000) };
    placeBubble();
  }

  // Keeps the bubble above its doll's head.
  function placeBubble() {
    if (!bubble) return;
    const { x, y } = bubble.doll.head.position;
    const r = bubble.el.getBoundingClientRect();
    bubble.el.style.left = `${Math.max(8, Math.min(W - r.width - 8, x - r.width / 2))}px`;
    bubble.el.style.top = `${Math.max(8, Math.min(H - r.height - 8, y - HEAD - r.height - 8))}px`;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const d of dolls) {
      for (const { body, fill } of d.parts) {
        if (body === d.head) continue;
        ctx.beginPath();
        body.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = fill === RED ? GOLD : INK;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const { x, y } = d.head.position;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.head.angle);
      ctx.beginPath();
      ctx.arc(0, 0, HEAD, 0, Math.PI * 2);
      ctx.fillStyle = RED;
      ctx.fill();
      if (d.img.complete && d.img.naturalWidth) {
        ctx.clip();
        ctx.drawImage(d.img, -HEAD, -HEAD, HEAD * 2, HEAD * 2);
      }
      ctx.restore();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, HEAD, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (drag) {
      const a = drag.constraint.pointA;
      const b = mw!.Matter.Constraint.pointBWorld(drag.constraint);
      ctx.strokeStyle = 'rgba(29,26,23,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function frame() {
    raf = 0;
    if (isPaused() || !dolls.length) return;
    draw();
    placeBubble();
    raf = requestAnimationFrame(frame);
  }

  // Doll part under a viewport point, if any.
  function hit(x: number, y: number): { doll: Doll; part: MatterNS.Body } | null {
    if (!mw || !dolls.length || isPaused() || document.querySelector('.cap')) return null;
    const bodies = dolls.flatMap((d) => d.parts.map((p) => p.body));
    const part = mw.Matter.Query.point(bodies, { x, y })[0];
    const doll = part && dollOf(part);
    return doll ? { doll, part } : null;
  }

  function grab(doll: Doll, part: MatterNS.Body, x: number, y: number) {
    const { Matter, engine } = mw!;
    const constraint = Matter.Constraint.create({
      pointA: { x, y },
      bodyB: part,
      pointB: { x: x - part.position.x, y: y - part.position.y },
      length: 0,
      stiffness: 0.2,
      damping: 0.05,
    });
    Matter.Composite.add(engine.world, constraint);
    drag = { doll, part, constraint };
    document.documentElement.classList.add('rd-grabbing');
    blip();
    if (Math.random() < 1 / 3) say(pick(data!.grabbed), doll);
  }

  function release() {
    if (!drag) return;
    const { doll, part, constraint } = drag;
    mw!.Matter.Composite.remove(mw!.engine.world, constraint);
    drag = null;
    document.documentElement.classList.remove('rd-grabbing');
    if (part.speed > HARD && Math.random() < 0.5) say(pick(data!.flung), doll);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 || drag) return;
    const h = hit(e.clientX, e.clientY);
    if (!h) return;
    e.preventDefault();
    e.stopPropagation();
    swallowClick = true;
    grab(h.doll, h.part, e.clientX, e.clientY);
  }

  function onPointerMove(e: PointerEvent) {
    if (drag) {
      drag.constraint.pointA = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType !== 'mouse') return;
    document.documentElement.classList.toggle('rd-grab', !!hit(e.clientX, e.clientY));
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

  // Touch on a doll must not scroll the page.
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (t && hit(t.clientX, t.clientY)) e.preventDefault();
  }

  function onResize() {
    resizeCanvas();
    if (mw) buildWalls();
  }

  // Counts visible, unpaused seconds on the page.
  const tick = window.setInterval(() => {
    if (isPaused() || document.hidden) return;
    seconds++;
    if (seconds % INTERVAL === 0) drop().catch((err) => console.error('ragdoll drop failed', err));
  }, 1000);

  // Window capture runs before the document-level game and captcha click handlers.
  addEventListener('click', onClick, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('touchstart', onTouchStart, { passive: false });
  addEventListener('resize', onResize);
  const offPause = onPause(() => {
    release();
    if (mw) mw.Matter.Runner.stop(mw.runner);
    cancelAnimationFrame(raf);
    raf = 0;
    canvas.style.display = 'none';
    if (bubble) bubble.el.style.display = 'none';
  });
  const offResume = onResume(() => {
    if (bubble) bubble.el.style.display = '';
    if (!mw) return;
    mw.Matter.Runner.run(mw.runner, mw.engine);
    if (!dolls.length) return;
    canvas.style.display = 'block';
    raf = requestAnimationFrame(frame);
  });

  return () => {
    clearInterval(tick);
    cancelAnimationFrame(raf);
    hideBubble();
    removeEventListener('click', onClick, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('touchstart', onTouchStart);
    removeEventListener('resize', onResize);
    offPause();
    offResume();
    document.documentElement.classList.remove('rd-grab', 'rd-grabbing');
    mw?.stop();
    canvas.remove();
    style.remove();
  };
}
