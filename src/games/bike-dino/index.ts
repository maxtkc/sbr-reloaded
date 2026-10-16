// Bike Dino: an endless runner on a bike down Mill Road.
import type { Color, KAPLAYCtx } from 'kaplay';
import { startKaplay } from '../../chaos/shared/kaplay';
import { beep, blip, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  slug: string;
  face: string;
}

type Kind = 'pothole' | 'scooter' | 'cones' | 'roadworks' | 'busstop' | 'pigeons';

interface Obstacle {
  kind: Kind;
  x: number;
  w: number;
  // Hit box top and bottom in world units (y up is negative, the lane is y 0).
  top: number;
  bottom: number;
  n: number;
  seed: number;
}

type State = 'ready' | 'play' | 'over';

// World units: the bike is about 22 wide. Speeds in units/s.
const GRAVITY = 420;
const JUMP_V = 135;
const HOLD_TIME = 0.25;
const CUT_V = 110;
const START_SPEED = 60;
const MAX_SPEED = 135;
const SHOP_W = 30;
const STAND_TOP = -29;
const DUCK_TOP = -20;

// Obstacle kinds: size, the route metres they start at and spawn weight.
const KINDS: Record<
  Kind,
  { w: number; top: number; bottom: number; from: number; weight: number }
> = {
  pothole: { w: 12, top: -1, bottom: 2, from: 0, weight: 3 },
  scooter: { w: 13, top: -5, bottom: 1, from: 0, weight: 3 },
  cones: { w: 5, top: -7, bottom: 1, from: 0, weight: 2 },
  roadworks: { w: 22, top: -9, bottom: 1, from: 250, weight: 2 },
  busstop: { w: 11, top: -18, bottom: 1, from: 400, weight: 1.5 },
  pigeons: { w: 12, top: -31, bottom: -23, from: 600, weight: 1.5 },
};

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
// Deterministic 0..1 noise for scenery.
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function readRoster(): RosterEntry[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('bike-dino-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('bike-dino-best', String(n));
  } catch {
    // Storage unavailable.
  }
}

export default function start(root: HTMLElement): () => void {
  let stop: (() => void) | undefined;
  let stopped = false;
  startKaplay(root, { background: [150, 196, 230], pixelDensity: devicePixelRatio }).then((ctx) => {
    if (stopped) return ctx.stop();
    stop = ctx.stop;
    run(ctx.k);
  });
  return () => {
    stopped = true;
    stop?.();
  };
}

function run(k: KAPLAYCtx): void {
  const rider = pick(readRoster().filter((m) => m.face));
  if (rider) k.loadSprite('rider', rider.face);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const GOLD = k.rgb(209, 185, 72);
  const RED = k.rgb(122, 15, 31);
  const WHITE = k.rgb(255, 255, 255);
  const INK = k.rgb(30, 30, 36);
  const LANE = k.rgb(170, 60, 50);
  const ROAD = k.rgb(70, 72, 78);
  const PAVE = k.rgb(170, 168, 160);
  const ORANGE = k.rgb(240, 120, 30);
  const LIME = k.rgb(120, 200, 40);
  const BRICKS: [number, number, number][] = [
    [214, 196, 150],
    [176, 92, 64],
    [196, 120, 84],
    [120, 160, 170],
    [210, 170, 120],
    [150, 120, 160],
    [190, 200, 160],
  ];

  let state: State = 'ready';
  let obstacles: Obstacle[] = [];
  let dist = 0;
  let speed = START_SPEED;
  let jumpY = 0;
  let vy = 0;
  let holdT = 0;
  let ducking = false;
  let nextSpawn = 0;
  let landmarkIndex = 0;
  let lap = 1;
  let nextFactM = data.factEvery;
  let factIndex = Math.floor(Math.random() * data.facts.length);
  let fact = '';
  let factT = 0;
  let night = 0;
  let sawNight = false;
  let best = loadBest();
  let title = data.title;
  let crashLine = '';
  let crashFact = '';
  let overT = 0;
  let time = 0;
  let crank = 0;
  let nextChime = 500;

  // Layout, derived from the canvas size each frame.
  const H = () => k.height();
  const W = () => k.width();
  const s = () => Math.min(H() / 100, W() / 140);
  const gy = () => H() * 0.78;
  const rx = () => Math.max(W() * 0.16, 14 * s());
  const metres = () => Math.floor(dist * data.scale);
  const routeM = () => metres() % data.end;
  const viewLeft = () => -rx() / s();
  const viewRight = () => (W() - rx()) / s();
  const viewTop = () => -gy() / s();
  const viewBottom = () => (H() - gy()) / s();
  // Text size in world units, never below a readable pixel size.
  const ts = (u: number, px = 11) => Math.max(u, px / s());

  function reset(): void {
    obstacles = [];
    dist = 0;
    speed = START_SPEED;
    jumpY = 0;
    vy = 0;
    holdT = 0;
    nextSpawn = viewRight() + 60;
    landmarkIndex = 0;
    lap = 1;
    nextFactM = data.factEvery;
    nextChime = 500;
    night = 0;
    sawNight = false;
    factT = 0;
  }

  function showFact(text: string): void {
    fact = text;
    factT = 4.5;
  }

  function nextFact(): string {
    return data.facts[factIndex++ % data.facts.length];
  }

  function onGround(): boolean {
    return jumpY <= 0.01;
  }

  function press(): void {
    if (state === 'over') {
      if (overT < 0.7) return;
      reset();
      state = 'play';
      return;
    }
    if (state === 'ready') {
      reset();
      state = 'play';
      return;
    }
    if (onGround()) {
      vy = JUMP_V;
      holdT = 0;
      beep(520, 70, 'triangle', 0.08);
    }
  }

  function holding(): boolean {
    return k.isKeyDown('space') || k.isKeyDown('up') || k.isKeyDown('w') || k.isMouseDown();
  }

  function spawn(): void {
    const m = nextSpawn * data.scale;
    const kinds = (Object.keys(KINDS) as Kind[]).filter(
      (kd) => KINDS[kd].from <= m && !(kd === 'pigeons' && touch),
    );
    const total = kinds.reduce((a, kd) => a + KINDS[kd].weight, 0);
    let r = Math.random() * total;
    let kind = kinds[0];
    for (const kd of kinds) {
      r -= KINDS[kd].weight;
      if (r <= 0) {
        kind = kd;
        break;
      }
    }
    const def = KINDS[kind];
    const n = kind === 'cones' ? 1 + Math.floor(Math.random() * 3) : kind === 'busstop' ? 3 : 1;
    const w = kind === 'cones' ? def.w * n + 2 * (n - 1) : def.w;
    obstacles.push({
      kind,
      x: nextSpawn,
      w,
      top: def.top,
      bottom: def.bottom,
      n,
      seed: Math.random(),
    });
    const gap = speed * 0.9 + 25;
    nextSpawn += w + gap * (1 + Math.random() * 0.9);
  }

  function crash(o: Obstacle): void {
    state = 'over';
    overT = 0;
    boom(350, 0.25);
    beep(140, 300, 'sawtooth', 0.08);
    crashLine = pick(data.crashes[o.kind]);
    crashFact = nextFact();
    title = `${metres()} m`;
    if (metres() > best) {
      best = metres();
      saveBest(best);
      title += '. New best!';
    }
  }

  function hits(o: Obstacle): boolean {
    const left = dist - 6;
    const right = dist + 8;
    const top = -jumpY + (ducking ? DUCK_TOP : STAND_TOP);
    const bottom = -jumpY;
    if (o.kind === 'pothole') {
      return onGround() && dist + 5 > o.x + 2 && dist - 4 < o.x + o.w - 2;
    }
    return (
      right > o.x + 1.5 && left < o.x + o.w - 1.5 && bottom > o.top + 1 && top < o.bottom - 0.5
    );
  }

  k.onKeyPress(['space', 'up', 'w', 'enter'], press);
  k.onMousePress(press);

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 1 / 30) * slow;
    time += dt;
    if (factT > 0) factT -= dt;
    if (state === 'over') {
      overT += dt;
      return;
    }
    if (state !== 'play') return;

    speed = Math.min(MAX_SPEED, START_SPEED + dist * 0.006);
    dist += speed * dt;
    crank += (speed * dt) / 6;

    // Jump: held input lowers gravity on the way up, an early release cuts the rise.
    const down = k.isKeyDown('down') || k.isKeyDown('s');
    if (!onGround() || vy > 0) {
      holdT += dt;
      let g = GRAVITY;
      if (vy > 0 && holding() && holdT < HOLD_TIME) g *= 0.45;
      if (vy > 0 && !holding()) vy = Math.min(vy, CUT_V);
      if (down) g *= 2.5;
      vy -= g * dt;
      jumpY += vy * dt;
      if (jumpY <= 0) {
        jumpY = 0;
        vy = 0;
      }
    }
    ducking = down && onGround();

    while (nextSpawn < dist + viewRight() + 20) spawn();
    obstacles = obstacles.filter((o) => o.x + o.w > dist + viewLeft() - 20);
    for (const o of obstacles) {
      if (hits(o)) return crash(o);
    }

    const m = metres();
    const newLap = Math.floor(m / data.end) + 1;
    if (newLap > lap) {
      // The last landmark sits at the lap boundary, so show it with the lap line.
      lap = newLap;
      landmarkIndex = 0;
      fanfare();
      showFact(
        `${data.landmarks[data.landmarks.length - 1].fact} ${data.lap.replace('{n}', String(lap))}`,
      );
    }
    const lm = data.landmarks[landmarkIndex];
    if (lm && routeM() >= lm.m && factT < 1) {
      landmarkIndex++;
      blip();
      showFact(lm.fact);
    } else if (m >= nextFactM) {
      if (factT <= 0) showFact(nextFact());
      nextFactM += data.factEvery;
    }
    if (m >= nextChime) {
      nextChime += 500;
      beep(1047, 60, 'square', 0.06);
      beep(1319, 90, 'square', 0.06, 70);
    }

    // Night for 400 m of every 1200 m.
    const isNight = m % 1200 >= 700 && m % 1200 < 1100;
    night = Math.max(0, Math.min(1, night + (isNight ? dt : -dt)));
    if (isNight && !sawNight) {
      sawNight = true;
      showFact(data.lightsOn);
    }
  });

  const mix = (a: [number, number, number], b: [number, number, number], t: number): Color =>
    k.rgb(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);

  function drawSky(): void {
    k.drawRect({
      pos: k.vec2(0, 0),
      width: W(),
      height: H(),
      color: mix([150, 196, 230], [18, 22, 46], night),
    });
    if (night > 0) {
      for (let i = 0; i < 40; i++) {
        k.drawCircle({
          pos: k.vec2(hash(i) * W(), hash(i + 99) * gy() * 0.6),
          radius: 1 + hash(i + 7),
          color: WHITE,
          opacity: night * 0.8,
        });
      }
      k.drawCircle({
        pos: k.vec2(W() * 0.8, H() * 0.14),
        radius: H() * 0.04,
        color: k.rgb(240, 236, 210),
        opacity: night,
      });
    }
    k.drawCircle({
      pos: k.vec2(W() * 0.8, H() * 0.14),
      radius: H() * 0.05,
      color: k.rgb(255, 220, 120),
      opacity: 1 - night,
    });
    // Clouds drift at a tenth of the road speed.
    for (let i = 0; i < 6; i++) {
      const span = W() + 200;
      const x = ((((hash(i + 40) * span - dist * s() * 0.1) % span) + span) % span) - 100;
      const y = H() * (0.08 + hash(i + 50) * 0.3);
      const r = Math.min(H(), W() * 0.7) * (0.025 + hash(i + 60) * 0.02);
      for (let j = 0; j < 3; j++) {
        k.drawCircle({
          pos: k.vec2(x + j * r * 1.1, y - (j === 1 ? r * 0.4 : 0)),
          radius: r,
          color: WHITE,
          opacity: 0.85 - night * 0.6,
        });
      }
    }
  }

  // Terraced shopfronts at half speed, origin at the pavement back edge.
  function drawShops(): void {
    const off = dist * 0.5;
    const first = Math.floor((off + viewLeft()) / SHOP_W) - 1;
    const last = Math.ceil((off + viewRight()) / SHOP_W) + 1;
    for (let i = first; i <= last; i++) {
      const x = i * SHOP_W - off;
      const h = 34 + Math.floor(hash(i) * 3) * 6;
      const base = mix(BRICKS[Math.floor(hash(i + 3) * BRICKS.length)], [30, 34, 60], night * 0.6);
      k.drawRect({ pos: k.vec2(x, -7 - h), width: SHOP_W, height: h, color: base });
      // Roof and chimney.
      k.drawRect({
        pos: k.vec2(x - 0.5, -7 - h - 2),
        width: SHOP_W + 1,
        height: 2,
        color: k.rgb(80, 70, 70),
      });
      k.drawRect({
        pos: k.vec2(x + 6 + hash(i + 5) * 14, -7 - h - 7),
        width: 3,
        height: 5,
        color: k.rgb(110, 70, 60),
      });
      // Upstairs windows, lit at night.
      const lit = mix([90, 110, 140], [250, 210, 110], night * (hash(i + 8) > 0.35 ? 1 : 0));
      for (let wi = 0; wi < 2; wi++) {
        k.drawRect({ pos: k.vec2(x + 5 + wi * 13, -7 - h + 6), width: 7, height: 9, color: lit });
      }
      // Shop window, awning and sign.
      k.drawRect({
        pos: k.vec2(x + 2, -21),
        width: SHOP_W - 4,
        height: 14,
        color: mix([60, 80, 100], [240, 200, 110], night),
      });
      k.drawRect({ pos: k.vec2(x + 20, -19), width: 6, height: 12, color: k.rgb(60, 40, 30) });
      const stripe = hash(i + 11) > 0.5 ? RED : k.rgb(40, 100, 70);
      for (let a = 0; a < 6; a++) {
        k.drawRect({
          pos: k.vec2(x + 1 + a * 4.67, -24),
          width: 4.67,
          height: 3,
          color: a % 2 ? WHITE : stripe,
        });
      }
      k.drawRect({
        pos: k.vec2(x + 1, -29.5),
        width: SHOP_W - 2,
        height: 5,
        color: k.rgb(30, 30, 40),
      });
      const name =
        data.shops[(((i * 5) % data.shops.length) + data.shops.length) % data.shops.length];
      k.drawText({
        text: name,
        pos: k.vec2(x + SHOP_W / 2, -27),
        size: Math.min(3, (SHOP_W - 4) / (name.length * 0.62)),
        anchor: 'center',
        color: GOLD,
      });
    }
  }

  function drawRoad(): void {
    const l = viewLeft() - 2;
    const w = viewRight() - l + 4;
    k.drawRect({ pos: k.vec2(l, -7), width: w, height: 5, color: PAVE });
    const slab = 8;
    for (let x = Math.floor((dist + l) / slab) * slab; x < dist + l + w; x += slab) {
      k.drawLine({
        p1: k.vec2(x - dist, -7),
        p2: k.vec2(x - dist - 2, -2),
        width: 0.3,
        color: k.rgb(140, 138, 130),
      });
    }
    k.drawRect({ pos: k.vec2(l, -2.6), width: w, height: 0.8, color: k.rgb(210, 208, 200) });
    k.drawRect({ pos: k.vec2(l, -1.8), width: w, height: 4.8, color: LANE });
    k.drawRect({ pos: k.vec2(l, 3), width: w, height: viewBottom() - 3 + 2, color: ROAD });
    k.drawRect({ pos: k.vec2(l, 3), width: w, height: 0.6, color: WHITE });
    const dash = 24;
    for (let x = Math.floor((dist + l) / dash) * dash; x < dist + l + w; x += dash) {
      k.drawRect({ pos: k.vec2(x - dist, 12), width: 12, height: 1, color: WHITE });
    }
    // Bike symbols painted in the lane.
    const sym = 140;
    for (let x = Math.floor((dist + l) / sym) * sym; x < dist + l + w; x += sym) {
      const cx = x - dist;
      k.drawCircle({
        pos: k.vec2(cx - 3, 0.6),
        radius: 1.6,
        fill: false,
        outline: { width: 0.4, color: WHITE },
      });
      k.drawCircle({
        pos: k.vec2(cx + 3, 0.6),
        radius: 1.6,
        fill: false,
        outline: { width: 0.4, color: WHITE },
      });
      k.drawLine({ p1: k.vec2(cx - 3, 0.6), p2: k.vec2(cx + 3, 0.6), width: 0.4, color: WHITE });
    }
  }

  // Signposts on the pavement at each landmark, this lap and the next.
  function drawLandmarks(): void {
    for (let lp = lap - 1; lp <= lap; lp++) {
      for (const lm of data.landmarks) {
        const x = (lp * data.end + lm.m) / data.scale - dist;
        if (x < viewLeft() - 40 || x > viewRight() + 40) continue;
        k.drawRect({ pos: k.vec2(x - 0.6, -40), width: 1.2, height: 35, color: k.rgb(60, 60, 60) });
        const size = ts(3.2);
        const bw = Math.max(lm.name.length * size * 0.62 + 4, 20);
        k.drawRect({
          pos: k.vec2(x, -40),
          width: bw,
          height: size + 3,
          anchor: 'center',
          color: k.rgb(20, 70, 50),
          outline: { width: 0.5, color: WHITE },
        });
        k.drawText({ text: lm.name, pos: k.vec2(x, -40), size, anchor: 'center', color: WHITE });
      }
    }
  }

  function drawPerson(x: number, y: number, h: number, coat: Color, seed: number): void {
    k.drawRect({ pos: k.vec2(x - 1.2, y - h * 0.45), width: 1, height: h * 0.45, color: INK });
    k.drawRect({ pos: k.vec2(x + 0.2, y - h * 0.45), width: 1, height: h * 0.45, color: INK });
    k.drawRect({
      pos: k.vec2(x - 2, y - h * 0.85),
      width: 4,
      height: h * 0.42,
      color: coat,
      radius: 0.8,
    });
    k.drawCircle({
      pos: k.vec2(x, y - h * 0.92),
      radius: h * 0.1,
      color: k.rgb(210 - seed * 80, 170 - seed * 70, 140 - seed * 60),
    });
  }

  function drawObstacle(o: Obstacle): void {
    const x = o.x - dist;
    switch (o.kind) {
      case 'pothole':
        k.drawEllipse({
          pos: k.vec2(x + o.w / 2, 0.6),
          radiusX: o.w / 2,
          radiusY: 2,
          color: k.rgb(30, 26, 26),
        });
        k.drawEllipse({
          pos: k.vec2(x + o.w / 2, 1.1),
          radiusX: o.w / 2 - 1.5,
          radiusY: 1.1,
          color: k.rgb(70, 90, 110),
          opacity: 0.7,
        });
        break;
      case 'scooter': {
        // Lying on its side across the lane.
        k.drawCircle({ pos: k.vec2(x + 2, -1.2), radius: 1.8, color: INK });
        k.drawCircle({ pos: k.vec2(x + o.w - 2, -1.2), radius: 1.8, color: INK });
        k.drawRect({ pos: k.vec2(x + 1, -3.4), width: o.w - 2, height: 1.8, color: LIME });
        k.drawLine({
          p1: k.vec2(x + o.w - 2, -2.8),
          p2: k.vec2(x + o.w - 9, -6),
          width: 1,
          color: LIME,
        });
        k.drawRect({ pos: k.vec2(x + o.w - 10.5, -6.8), width: 3, height: 1, color: INK });
        k.drawText({
          text: 'lime',
          pos: k.vec2(x + o.w / 2, -2.5),
          size: 1.6,
          anchor: 'center',
          color: WHITE,
        });
        break;
      }
      case 'cones':
        for (let i = 0; i < o.n; i++) {
          const cx = x + 2.5 + i * 7;
          k.drawTriangle({
            p1: k.vec2(cx - 2.5, 0.5),
            p2: k.vec2(cx + 2.5, 0.5),
            p3: k.vec2(cx, -7),
            color: ORANGE,
          });
          k.drawRect({ pos: k.vec2(cx - 1.3, -4), width: 2.6, height: 1.2, color: WHITE });
          k.drawRect({ pos: k.vec2(cx - 3, -0.2), width: 6, height: 1, color: ORANGE });
        }
        break;
      case 'roadworks': {
        for (const lx of [x + 1, x + o.w - 2]) {
          k.drawRect({ pos: k.vec2(lx, -9), width: 1, height: 9.5, color: INK });
        }
        for (let i = 0; i < 6; i++) {
          k.drawRect({
            pos: k.vec2(x + i * (o.w / 6), -8),
            width: o.w / 6,
            height: 3,
            color: i % 2 ? WHITE : RED,
          });
        }
        // Warning sign: the triangle, or Cyclists Dismount every other time.
        k.drawRect({ pos: k.vec2(x + o.w / 2 - 0.4, -18), width: 0.8, height: 10, color: INK });
        if (o.seed > 0.5) {
          k.drawTriangle({
            p1: k.vec2(x + o.w / 2 - 5, -14),
            p2: k.vec2(x + o.w / 2 + 5, -14),
            p3: k.vec2(x + o.w / 2, -22.5),
            color: RED,
          });
          k.drawTriangle({
            p1: k.vec2(x + o.w / 2 - 3.4, -15),
            p2: k.vec2(x + o.w / 2 + 3.4, -15),
            p3: k.vec2(x + o.w / 2, -20.8),
            color: WHITE,
          });
          k.drawText({
            text: '!',
            pos: k.vec2(x + o.w / 2, -16.6),
            size: 3.2,
            anchor: 'center',
            color: INK,
          });
        } else {
          k.drawRect({
            pos: k.vec2(x + o.w / 2, -19),
            width: 15,
            height: 7,
            anchor: 'center',
            color: k.rgb(20, 60, 140),
            outline: { width: 0.4, color: WHITE },
          });
          k.drawText({
            text: 'CYCLISTS\nDISMOUNT',
            pos: k.vec2(x + o.w / 2, -19),
            size: 2.2,
            anchor: 'center',
            align: 'center',
            color: WHITE,
          });
        }
        k.drawCircle({
          pos: k.vec2(x + 1.5, -9.8),
          radius: 0.9,
          color: k.rgb(255, 180, 40),
          opacity: 0.5 + 0.5 * Math.sin(time * 8),
        });
        break;
      }
      case 'busstop': {
        // Shelter on the pavement, the queue spilling into the lane.
        k.drawRect({ pos: k.vec2(x - 6, -30), width: 24, height: 1.5, color: k.rgb(60, 60, 70) });
        k.drawRect({
          pos: k.vec2(x - 6, -28.5),
          width: 24,
          height: 21.5,
          color: k.rgb(170, 200, 220),
          opacity: 0.35,
        });
        k.drawRect({
          pos: k.vec2(x - 6, -28.5),
          width: 0.8,
          height: 21.5,
          color: k.rgb(60, 60, 70),
        });
        k.drawRect({
          pos: k.vec2(x + 17.2, -28.5),
          width: 0.8,
          height: 21.5,
          color: k.rgb(60, 60, 70),
        });
        k.drawRect({ pos: k.vec2(x + 22, -36), width: 0.8, height: 29, color: INK });
        k.drawCircle({
          pos: k.vec2(x + 22.4, -36),
          radius: 3,
          color: RED,
          outline: { width: 0.5, color: WHITE },
        });
        k.drawText({
          text: 'BUS',
          pos: k.vec2(x + 22.4, -36),
          size: 1.8,
          anchor: 'center',
          color: WHITE,
        });
        const coats = [k.rgb(40, 60, 120), k.rgb(140, 50, 50), k.rgb(70, 110, 60)];
        for (let i = 0; i < o.n; i++) {
          drawPerson(
            x + 2 + i * 3.5,
            0.5,
            17 + hash(o.seed + i) * 2,
            coats[i % 3],
            hash(o.seed * 3 + i),
          );
        }
        break;
      }
      case 'pigeons':
        // Two pigeons flying at head height, facing the rider.
        for (let i = 0; i < 2; i++) {
          const px = x + 3.5 + i * 6;
          const py = -27 + Math.sin(time * 3 + i * 2) * 1.2 - i * 1.5;
          const flap = Math.sin(time * 18 + i * 1.7) * 3;
          const grey = k.rgb(105, 110, 128);
          k.drawEllipse({
            pos: k.vec2(px, py),
            radiusX: 3.4,
            radiusY: 2,
            color: grey,
            outline: { width: 0.3, color: INK },
          });
          k.drawTriangle({
            p1: k.vec2(px + 2.8, py - 0.4),
            p2: k.vec2(px + 5.2, py - 1.4),
            p3: k.vec2(px + 5.2, py + 0.8),
            color: grey,
          });
          k.drawCircle({
            pos: k.vec2(px - 3.4, py - 1.2),
            radius: 1.6,
            color: k.rgb(80, 120, 110),
          });
          k.drawCircle({
            pos: k.vec2(px - 3.9, py - 1.6),
            radius: 0.4,
            color: k.rgb(230, 120, 40),
          });
          k.drawTriangle({
            p1: k.vec2(px - 5, py - 1.4),
            p2: k.vec2(px - 6.3, py - 0.9),
            p3: k.vec2(px - 5, py - 0.6),
            color: k.rgb(230, 170, 60),
          });
          k.drawTriangle({
            p1: k.vec2(px - 1.5, py - 0.5),
            p2: k.vec2(px + 2, py - 0.5),
            p3: k.vec2(px + 1, py - 4 - flap),
            color: k.rgb(150, 155, 172),
            outline: { width: 0.3, color: INK },
          } as Parameters<typeof k.drawTriangle>[0]);
        }
        break;
    }
  }

  // Bike and rider, origin at the wheel contact point.
  function drawRider(): void {
    const crashing = state === 'over';
    // Crash progress 0..1: the bike drops and noses over, the rider flies over the bars.
    const u = Math.min(overT / 0.8, 1);
    const wheelA = crank * 1.6;
    k.pushTransform();
    if (crashing) {
      k.pushTranslate(8, -jumpY * (1 - u));
      k.pushRotate(u * 20);
      k.pushTranslate(-8, 0);
    } else {
      k.pushTranslate(0, -jumpY);
    }
    const frame = k.rgb(30, 70, 120);
    const rear = k.vec2(-8, -5);
    const front = k.vec2(8, -5);
    const bb = k.vec2(-1, -5);
    const seat = k.vec2(-3, -14);
    const head = k.vec2(6, -14);
    for (const c of [rear, front]) {
      k.drawCircle({ pos: c, radius: 5, fill: false, outline: { width: 1.2, color: INK } });
      for (let i = 0; i < 3; i++) {
        const a = wheelA + (i * Math.PI) / 3;
        const d = k.vec2(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
        k.drawLine({ p1: c.sub(d), p2: c.add(d), width: 0.25, color: k.rgb(150, 150, 150) });
      }
    }
    const tube = (a: ReturnType<typeof k.vec2>, b: ReturnType<typeof k.vec2>) =>
      k.drawLine({ p1: a, p2: b, width: 1, color: frame });
    tube(rear, seat);
    tube(seat, bb);
    tube(bb, rear);
    tube(bb, head);
    tube(seat, head.add(0, 1.5));
    tube(head, front);
    k.drawLine({ p1: head, p2: k.vec2(5, -17), width: 0.8, color: INK });
    k.drawLine({ p1: k.vec2(5, -17), p2: k.vec2(3, -17), width: 0.8, color: INK });
    k.drawRect({ pos: k.vec2(-5, -15.2), width: 4, height: 1.2, color: INK, radius: 0.4 });
    // Basket and mudguard.
    k.drawRect({
      pos: k.vec2(7, -18.5),
      width: 5.5,
      height: 4,
      color: k.rgb(150, 110, 60),
      radius: 0.4,
    });
    k.drawLine({
      p1: k.vec2(7, -16.5),
      p2: k.vec2(12.5, -16.5),
      width: 0.3,
      color: k.rgb(110, 80, 40),
    });
    // Lights, with beams at night.
    if (night > 0) {
      k.drawTriangle({
        p1: k.vec2(12.5, -15.5),
        p2: k.vec2(60, -24),
        p3: k.vec2(60, 2),
        color: k.rgb(255, 250, 200),
        opacity: 0.25 * night,
      });
      k.drawCircle({
        pos: k.vec2(-11, -9),
        radius: 2.5,
        color: k.rgb(255, 40, 40),
        opacity: 0.4 * night,
      });
    }
    k.drawCircle({
      pos: k.vec2(12.5, -15.5),
      radius: 0.9,
      color: night > 0 ? k.rgb(255, 250, 210) : k.rgb(220, 220, 220),
    });
    k.drawRect({ pos: k.vec2(-12, -10), width: 1.4, height: 1.4, color: k.rgb(220, 30, 30) });

    // Rider: thrown forward and spinning after a crash.
    if (crashing) {
      k.popTransform();
      k.pushTransform();
      // Spin about the torso and land lying flat, head forward.
      const ry = -jumpY + (12.5 + jumpY) * u - 25 * Math.sin(Math.PI * u);
      k.pushTranslate(30 * u, ry - 15);
      k.pushRotate(u * 450);
      k.pushTranslate(0, 15);
    }
    const duck = ducking && !crashing;
    const hip = k.vec2(-3, -15);
    const shoulder = duck ? k.vec2(4, -19) : k.vec2(0, -24);
    const face = duck ? k.vec2(7.5, -21.5) : k.vec2(1.2, -28);
    // Legs to the pedals: thigh and calf with the knee pushed forward.
    for (const side of [0, Math.PI]) {
      const a = crank + side;
      const pedal = bb.add(Math.cos(a) * 2.6, Math.sin(a) * 2.6);
      const mid = hip.add(pedal).scale(0.5);
      const knee = mid.add(2.4, -2.2);
      const leg = side ? k.rgb(25, 30, 60) : k.rgb(40, 46, 86);
      k.drawLine({ p1: hip, p2: knee, width: 2, color: leg });
      k.drawLine({ p1: knee, p2: pedal, width: 1.7, color: leg });
      k.drawRect({ pos: pedal, width: 2.4, height: 0.9, anchor: 'center', color: INK });
    }
    // Gown torso, arm to the bars, LMBC red scarf streaming back.
    k.drawLine({ p1: hip, p2: shoulder, width: 4.5, color: k.rgb(24, 24, 30) });
    k.drawLine({ p1: shoulder, p2: k.vec2(4, -17), width: 1.4, color: k.rgb(24, 24, 30) });
    const wave = Math.sin(time * 14) * 1.2;
    k.drawLine({
      p1: shoulder.add(0, -0.5),
      p2: shoulder.add(-6, 1 + wave),
      width: 1.4,
      color: RED,
    });
    k.drawLine({
      p1: shoulder.add(-6, 1 + wave),
      p2: shoulder.add(-10, 0.5 - wave),
      width: 1.2,
      color: WHITE,
    });
    if (rider && k.getSprite('rider')?.data) {
      k.drawSprite({ sprite: 'rider', pos: face, width: 8, height: 8, anchor: 'center' });
    } else {
      k.drawCircle({ pos: face, radius: 3.5, color: k.rgb(235, 200, 170) });
    }
    k.popTransform();
  }

  function drawWorld(): void {
    k.pushTransform();
    k.pushTranslate(rx(), gy());
    k.pushScale(s(), s());
    drawShops();
    drawRoad();
    drawLandmarks();
    for (const o of obstacles) if (o.kind === 'busstop') drawObstacle(o);
    for (const o of obstacles) if (o.kind !== 'busstop') drawObstacle(o);
    if (night > 0) {
      k.drawRect({
        pos: k.vec2(viewLeft(), viewTop()),
        width: viewRight() - viewLeft(),
        height: viewBottom() - viewTop(),
        color: k.rgb(10, 14, 40),
        opacity: night * 0.35,
      });
    }
    drawRider();
    k.popTransform();
  }

  function banner(lines: string[], cy: number, sizes: number[]): void {
    // Lines stacked by their wrapped heights.
    const bw = Math.min(W() * 0.92, 720);
    const gap = Math.min(H() * 0.02, 12);
    const opts = lines.map((text, i) => ({
      text,
      size: Math.max(12, Math.min(H() * sizes[i], W() * sizes[i] * 1.4)),
      width: bw * 0.92,
      align: 'center' as const,
      color: i === 0 ? GOLD : WHITE,
    }));
    const heights = opts.map((o) => (o.text ? k.formatText(o).height : 0));
    const total = heights.reduce((a, h) => a + h + gap, gap);
    k.drawRect({
      pos: k.vec2(W() / 2, cy),
      width: bw,
      height: total,
      anchor: 'center',
      color: k.rgb(20, 20, 30),
      opacity: 0.88,
      radius: 10,
    });
    let y = cy - total / 2 + gap;
    opts.forEach((o, i) => {
      k.drawText({ ...o, pos: k.vec2(W() / 2, y), anchor: 'top' });
      y += heights[i] + gap;
    });
  }

  function drawHud(): void {
    const size = Math.max(14, Math.min(H() * 0.04, 28));
    const pad = Math.max(10, W() * 0.02);
    const shadow = (
      text: string,
      pos: ReturnType<typeof k.vec2>,
      anchor: 'topleft' | 'topright' | 'top',
      sz = size,
    ) => {
      k.drawText({
        text,
        pos: pos.add(2, 2),
        size: sz,
        anchor,
        color: k.rgb(0, 0, 0),
        opacity: 0.5,
      });
      k.drawText({ text, pos, size: sz, anchor, color: WHITE });
    };
    shadow(`${metres()} m`, k.vec2(pad, pad), 'topleft');
    shadow(`Best ${best} m`, k.vec2(W() - pad, pad), 'topright');
    const lm = data.landmarks[landmarkIndex];
    if (state === 'play' && lm) {
      shadow(
        `Next: ${lm.name} in ${lm.m - routeM()} m${lap > 1 ? `   Lap ${lap}` : ''}`,
        k.vec2(pad, pad + size * 1.3),
        'topleft',
        size * 0.6,
      );
    }

    if (factT > 0 && state === 'play') {
      const bw = Math.min(W() * 0.92, 720);
      const fy = H() * 0.3;
      const o = Math.min(1, factT);
      k.drawRect({
        pos: k.vec2(W() / 2, fy),
        width: bw,
        height: Math.max(H() * 0.1, 56),
        anchor: 'center',
        color: RED,
        outline: { width: 3, color: GOLD },
        radius: 8,
        opacity: o,
      });
      k.drawText({
        text: fact,
        pos: k.vec2(W() / 2, fy),
        size: Math.max(12, Math.min(H() * 0.028, W() * 0.04, 22)),
        width: bw * 0.92,
        align: 'center',
        anchor: 'center',
        color: WHITE,
        opacity: o,
      });
    }

    if (state === 'ready') {
      banner(
        [data.title, data.subtitle, touch ? data.introTouch : data.intro],
        H() * 0.32,
        [0.045, 0.03, 0.026],
      );
    } else if (state === 'over') {
      banner(
        [title, crashLine, crashFact, overT > 0.7 ? data.restart : ''],
        H() * 0.32,
        [0.045, 0.03, 0.024, 0.024],
      );
    }
  }

  reset();
  k.onDraw(() => {
    drawSky();
    drawWorld();
    drawHud();
  });
}
