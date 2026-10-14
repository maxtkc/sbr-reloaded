// Flappy Eagle: the crest eagle from the college arms flaps between Chapel towers and the Great Gate.
import type { KAPLAYCtx } from 'kaplay';
import arms from '../../data/arms-parts.json';
import wingLUrl from '../../assets/arms/parts/eagle-wing-l.svg?url';
import wingRUrl from '../../assets/arms/parts/eagle-wing-r.svg?url';
import bodyUrl from '../../assets/arms/parts/eagle-body.svg?url';
import { startKaplay } from '../../chaos/shared/kaplay';
import { beep, blip, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

type PartName = 'eagle-wing-l' | 'eagle-wing-r' | 'eagle-body';
const part = (name: PartName) => arms.parts.find((p) => p.name === name)!;
const PARTS = { 'eagle-wing-l': wingLUrl, 'eagle-wing-r': wingRUrl, 'eagle-body': bodyUrl };

// Eagle centre in arms viewBox units, and the neck point the body jangles around.
const CENTER = { x: 489, y: 215 };
const NECK = { x: 474, y: 140 };
const EAGLE_UNITS = 434;

interface Obstacle {
  x: number;
  gapTop: number;
  gapBottom: number;
  kind: 'chapel' | 'gate';
  passed: boolean;
}

type State = 'ready' | 'play' | 'dead';

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function loadBest(): number {
  try {
    return Number(localStorage.getItem('flappy-eagle-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('flappy-eagle-best', String(n));
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
  for (const [name, src] of Object.entries(PARTS)) k.loadSprite(name, src);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const STONE = k.rgb(214, 196, 150);
  const STONE_DARK = k.rgb(150, 132, 92);
  const BRICK = k.rgb(170, 78, 52);
  const BRICK_DARK = k.rgb(110, 46, 30);
  const GLASS = k.rgb(40, 60, 110);
  const GOLD = k.rgb(209, 185, 72);
  const RED = k.rgb(122, 15, 31);
  const CLOUD = k.rgb(118, 124, 136);
  const CLOUD_DARK = k.rgb(92, 98, 110);

  let state: State = 'ready';
  let y = 0;
  let vy = 0;
  let spin = 0;
  let flapT = 1;
  let time = 0;
  let deadT = 0;
  let scroll = 0;
  let score = 0;
  let best = loadBest();
  let nextMilestone = 0;
  let fact = '';
  let factT = 0;
  let death = '';
  let obstacles: Obstacle[] = [];

  // All sizes scale with the viewport height.
  const H = () => k.height();
  const W = () => k.width();
  const groundY = () => H() * 0.9;
  const eagleX = () => Math.min(W() * 0.3, H() * 0.45);
  const scale = () => (H() * 0.12) / EAGLE_UNITS;
  const radius = () => H() * 0.036;
  const obstacleW = () => H() * 0.14;
  const gap = () => H() * Math.max(0.25, 0.31 - score * 0.002);
  const speed = () => H() * 0.32;

  function reset(): void {
    state = 'ready';
    y = H() * 0.45;
    vy = 0;
    spin = 0;
    score = 0;
    nextMilestone = 0;
    factT = 0;
    obstacles = [];
  }

  function flap(): void {
    if (state === 'dead') {
      if (deadT < 0.7) return;
      reset();
    }
    if (state === 'ready') state = 'play';
    vy = -H() * 0.62;
    flapT = 0;
    beep(520, 60, 'triangle', 0.08);
    // Chain and crown jangle.
    beep(2300, 40, 'triangle', 0.03, 40);
    beep(2700, 40, 'triangle', 0.03, 90);
  }

  function die(): void {
    if (state === 'dead') return;
    state = 'dead';
    deadT = 0;
    death = pick(data.deaths);
    vy = Math.min(vy, -H() * 0.3);
    boom(350, 0.25);
    if (score > best) {
      best = score;
      saveBest(best);
    }
  }

  function spawn(): void {
    const g = gap();
    const top = H() * 0.12 + Math.random() * (groundY() - H() * 0.24 - g);
    obstacles.push({
      x: W() + obstacleW(),
      gapTop: top,
      gapBottom: top + g,
      kind: Math.random() < 0.5 ? 'chapel' : 'gate',
      passed: false,
    });
  }

  // Circle vs axis-aligned rect.
  function hits(cx: number, cy: number, r: number, x: number, y0: number, y1: number): boolean {
    const nx = Math.max(x, Math.min(cx, x + obstacleW()));
    const ny = Math.max(y0, Math.min(cy, y1));
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }

  k.onKeyPress(['space', 'up', 'w'], flap);
  k.onMousePress(flap);
  k.onResize(() => {
    if (state === 'ready') y = H() * 0.45;
  });
  reset();

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 1 / 30) * slow;
    time += dt;
    flapT += dt;
    factT -= dt;
    if (state === 'ready') {
      y = H() * 0.45 + Math.sin(time * 3) * H() * 0.015;
      if (flapT > 0.6) flapT = 0;
      scroll += speed() * dt * 0.5;
      return;
    }
    vy += H() * 2.2 * dt;
    y += vy * dt;
    if (y < radius()) {
      y = radius();
      vy = Math.max(vy, 0);
    }
    if (state === 'dead') {
      deadT += dt;
      spin += dt * 540;
      if (y > groundY() - radius()) {
        y = groundY() - radius();
        vy = 0;
      }
      return;
    }
    scroll += speed() * dt;
    for (const o of obstacles) o.x -= speed() * dt;
    obstacles = obstacles.filter((o) => o.x > -obstacleW() * 2);
    const last = obstacles.at(-1);
    if (!last || last.x < W() - Math.max(H() * 0.55, obstacleW() * 3)) spawn();

    const ex = eagleX();
    const r = radius();
    for (const o of obstacles) {
      if (hits(ex, y, r, o.x, -H(), o.gapTop) || hits(ex, y, r, o.x, o.gapBottom, H())) die();
      if (!o.passed && o.x + obstacleW() < ex) {
        o.passed = true;
        score++;
        blip();
        // Listed milestones, then every 10 points.
        const ms = data.milestones;
        const target =
          nextMilestone < ms.length
            ? ms[nextMilestone]
            : ms.at(-1)! + 10 * (nextMilestone - ms.length + 1);
        if (score >= target) {
          fact = data.facts[nextMilestone % data.facts.length];
          factT = 4;
          nextMilestone++;
          fanfare();
        }
      }
    }
    if (y > groundY() - r) {
      y = groundY() - r;
      die();
    }
  });

  function drawSky(): void {
    k.drawRect({
      pos: k.vec2(0, 0),
      width: W(),
      height: groundY(),
      gradient: [k.rgb(120, 170, 215), k.rgb(225, 228, 220)],
    });
    // Distant spires, parallax.
    const step = H() * 0.22;
    const off = (scroll * 0.2) % step;
    for (
      let x = -off - step, i = Math.floor((scroll * 0.2) / step);
      x < W() + step;
      x += step, i++
    ) {
      const h = H() * (0.1 + ((i * 37) % 5) * 0.025);
      const base = groundY();
      k.drawRect({
        pos: k.vec2(x, base - h),
        width: step * 0.35,
        height: h,
        color: k.rgb(170, 180, 190),
      });
      k.drawTriangle({
        p1: k.vec2(x, base - h),
        p2: k.vec2(x + step * 0.35, base - h),
        p3: k.vec2(x + step * 0.175, base - h - H() * 0.06),
        color: k.rgb(170, 180, 190),
      });
    }
  }

  function drawGround(): void {
    const gy = groundY();
    k.drawRect({ pos: k.vec2(0, gy), width: W(), height: H() - gy, color: k.rgb(86, 150, 70) });
    k.drawRect({
      pos: k.vec2(0, gy + (H() - gy) * 0.55),
      width: W(),
      height: H(),
      color: k.rgb(70, 110, 140),
    });
    // Mowing stripes.
    const step = H() * 0.05;
    for (let x = -(scroll % (step * 2)); x < W(); x += step * 2) {
      k.drawRect({
        pos: k.vec2(x, gy),
        width: step,
        height: (H() - gy) * 0.55,
        color: k.rgb(100, 168, 80),
      });
    }
    k.drawText({
      text: data.labels.ground,
      pos: k.vec2(W() - H() * 0.02, gy + (H() - gy) * 0.27),
      size: H() * 0.025,
      anchor: 'right',
      color: k.rgb(230, 240, 220),
    });
  }

  function drawCloud(o: Obstacle): void {
    const w = obstacleW();
    const r = w * 0.22;
    k.drawRect({ pos: k.vec2(o.x, 0), width: w, height: o.gapTop - r, color: CLOUD });
    for (let i = 0; i < 4; i++) {
      k.drawCircle({
        pos: k.vec2(o.x + r + i * ((w - 2 * r) / 3), o.gapTop - r),
        radius: r,
        color: CLOUD,
      });
    }
    // Drizzle streaks inside the cloud.
    for (let i = 0; i < 5; i++) {
      const sx = o.x + w * (0.15 + i * 0.17);
      const sy = ((time * H() * 0.4 + i * 37) % Math.max(1, o.gapTop - r * 2)) + 4;
      k.drawLine({ p1: k.vec2(sx, sy), p2: k.vec2(sx - 3, sy + r), width: 2, color: CLOUD_DARK });
    }
    if (o.gapTop > H() * 0.15) {
      k.drawText({
        text: data.labels.cloud,
        pos: k.vec2(o.x + w / 2, o.gapTop * 0.45),
        size: H() * 0.018,
        width: w * 0.9,
        align: 'center',
        anchor: 'center',
        color: k.rgb(230, 232, 236),
      });
    }
  }

  function drawChapel(o: Obstacle): void {
    const w = obstacleW();
    const pin = H() * 0.06;
    const top = o.gapBottom + pin;
    const base = groundY();
    k.drawRect({
      pos: k.vec2(o.x, top),
      width: w,
      height: base - top,
      color: STONE,
      outline: { width: 2, color: STONE_DARK },
    });
    // Four corner pinnacles and battlements between them.
    for (let i = 0; i < 4; i++) {
      const px = o.x + (i * (w - w * 0.14)) / 3;
      k.drawRect({
        pos: k.vec2(px, top - pin * 0.35),
        width: w * 0.14,
        height: pin * 0.35,
        color: STONE,
      });
      k.drawTriangle({
        p1: k.vec2(px, top - pin * 0.35),
        p2: k.vec2(px + w * 0.14, top - pin * 0.35),
        p3: k.vec2(px + w * 0.07, top - pin),
        color: STONE,
        outline: { width: 1, color: STONE_DARK },
      });
    }
    for (let i = 0; i < 6; i++) {
      k.drawRect({
        pos: k.vec2(o.x + w * (0.1 + i * 0.15), top - pin * 0.15),
        width: w * 0.08,
        height: pin * 0.15,
        color: STONE,
      });
    }
    // Lancet windows down the tower.
    for (let wy = top + H() * 0.04; wy < base - H() * 0.1; wy += H() * 0.16) {
      for (const fx of [0.22, 0.58]) {
        k.drawRect({
          pos: k.vec2(o.x + w * fx, wy),
          width: w * 0.2,
          height: H() * 0.1,
          color: GLASS,
          radius: [w * 0.1, w * 0.1, 0, 0],
        });
      }
    }
    k.drawText({
      text: data.labels.chapel,
      pos: k.vec2(o.x + w / 2, base - H() * 0.03),
      size: H() * 0.02,
      anchor: 'center',
      color: STONE_DARK,
    });
  }

  function drawGate(o: Obstacle): void {
    const w = obstacleW();
    const tur = w * 0.22;
    const top = o.gapBottom + H() * 0.04;
    const base = groundY();
    k.drawRect({
      pos: k.vec2(o.x + tur * 0.5, top + H() * 0.02),
      width: w - tur,
      height: base - top,
      color: BRICK,
      outline: { width: 2, color: BRICK_DARK },
    });
    // Corner turrets with pinnacles.
    for (const tx of [o.x, o.x + w - tur]) {
      k.drawRect({
        pos: k.vec2(tx, top),
        width: tur,
        height: base - top,
        color: BRICK,
        outline: { width: 2, color: BRICK_DARK },
      });
      k.drawTriangle({
        p1: k.vec2(tx, top),
        p2: k.vec2(tx + tur, top),
        p3: k.vec2(tx + tur / 2, top - H() * 0.04),
        color: STONE,
        outline: { width: 1, color: STONE_DARK },
      });
    }
    // Gilded arms panel and the gate arch.
    k.drawRect({
      pos: k.vec2(o.x + w * 0.38, top + H() * 0.06),
      width: w * 0.24,
      height: w * 0.28,
      color: RED,
      outline: { width: 2, color: GOLD },
    });
    const archH = Math.min(H() * 0.14, (base - top) * 0.5);
    k.drawRect({
      pos: k.vec2(o.x + w * 0.33, base - archH),
      width: w * 0.34,
      height: archH,
      color: k.rgb(50, 30, 20),
      radius: [w * 0.17, w * 0.17, 0, 0],
    });
    k.drawText({
      text: data.labels.gate,
      pos: k.vec2(o.x + w / 2, top + H() * 0.04),
      size: H() * 0.018,
      anchor: 'center',
      color: k.rgb(250, 235, 210),
    });
  }

  function drawEagle(): void {
    const s = scale();
    let tilt = Math.max(-25, Math.min(70, (vy / H()) * 45));
    if (state === 'dead') tilt = spin;
    // Downstroke right after a flap.
    const stroke = flapT < 0.25 ? Math.sin((Math.PI * flapT) / 0.25) * 45 : 0;
    const jangle = Math.sin(flapT * 45) * Math.exp(-flapT * 5) * 6;

    k.pushTransform();
    k.pushTranslate(eagleX(), y);
    k.pushRotate(tilt);
    // Mirror so the eagle faces right.
    k.pushScale(-s, s);
    const drawPart = (name: PartName, angle: number, pivot: { x: number; y: number }) => {
      const p = part(name);
      k.pushTransform();
      k.pushTranslate(pivot.x - CENTER.x, pivot.y - CENTER.y);
      k.pushRotate(angle);
      k.drawSprite({
        sprite: name,
        pos: k.vec2(p.x - pivot.x, p.y - pivot.y),
        width: p.width,
        height: p.height,
      });
      k.popTransform();
    };
    const wl = part('eagle-wing-l');
    const wr = part('eagle-wing-r');
    drawPart('eagle-wing-l', -stroke, { x: wl.pivot[0], y: wl.pivot[1] });
    drawPart('eagle-wing-r', stroke, { x: wr.pivot[0], y: wr.pivot[1] });
    drawPart('eagle-body', jangle, NECK);
    k.popTransform();
  }

  function drawHud(): void {
    const size = H() * 0.06;
    k.drawText({
      text: String(score),
      pos: k.vec2(W() / 2 + 2, H() * 0.04 + 2),
      size,
      anchor: 'top',
      color: k.rgb(0, 0, 0),
      opacity: 0.4,
    });
    k.drawText({
      text: String(score),
      pos: k.vec2(W() / 2, H() * 0.04),
      size,
      anchor: 'top',
      color: k.rgb(255, 255, 255),
    });

    if (factT > 0) {
      const bw = Math.min(W() * 0.9, H() * 0.9);
      const by = H() * 0.2;
      k.drawRect({
        pos: k.vec2(W() / 2, by),
        width: bw,
        height: H() * 0.1,
        anchor: 'center',
        color: RED,
        outline: { width: 3, color: GOLD },
        radius: 8,
        opacity: Math.min(1, factT),
      });
      k.drawText({
        text: fact,
        pos: k.vec2(W() / 2, by),
        size: H() * 0.026,
        width: bw * 0.92,
        align: 'center',
        anchor: 'center',
        color: k.rgb(255, 255, 255),
        opacity: Math.min(1, factT),
      });
    }

    if (state === 'ready' || state === 'dead') {
      const bw = Math.min(W() * 0.9, H() * 0.8);
      const lines =
        state === 'ready'
          ? [data.subtitle, data.intro]
          : [death, `Score ${score}   Best ${best}`, deadT > 0.7 ? data.intro : ''];
      k.drawRect({
        pos: k.vec2(W() / 2, H() * 0.62),
        width: bw,
        height: H() * (0.1 + 0.065 * (lines.length - 1)),
        anchor: 'center',
        color: k.rgb(20, 20, 30),
        opacity: 0.75,
        radius: 10,
      });
      lines.forEach((text, i) => {
        k.drawText({
          text,
          pos: k.vec2(W() / 2, H() * (0.62 + (i - (lines.length - 1) / 2) * 0.065)),
          size: H() * (i === 0 ? 0.03 : 0.026),
          width: bw * 0.92,
          align: 'center',
          anchor: 'center',
          color: i === 0 ? GOLD : k.rgb(255, 255, 255),
        });
      });
    }
  }

  k.onDraw(() => {
    drawSky();
    for (const o of obstacles) {
      drawCloud(o);
      if (o.kind === 'chapel') drawChapel(o);
      else drawGate(o);
    }
    drawGround();
    drawEagle();
    drawHud();
  });
}
