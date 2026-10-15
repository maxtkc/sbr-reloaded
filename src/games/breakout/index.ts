// Breakout: knock down the Bridge of Sighs from a punt on the Cam.
import type { KAPLAYCtx } from 'kaplay';
import { startKaplay } from '../../chaos/shared/kaplay';
import { beep, blip, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  slug: string;
  face: string;
}

interface Brick {
  c: number;
  r: number;
  kind: '#' | 'w' | 'g';
  hp: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: [number, number, number];
}

type State = 'ready' | 'play' | 'over';

const COLS = data.bridge[0].length;
const ROWS = data.bridge.length;
const POINTS = { '#': 10, w: 25, g: 50 };

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function readRoster(): RosterEntry[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('breakout-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('breakout-best', String(n));
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
  const punter = pick(readRoster().filter((m) => m.face));
  if (punter) k.loadSprite('punter', punter.face);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const STONE = [214, 196, 150] as const;
  const STONE_DARK = k.rgb(150, 132, 92);
  const GLASS = k.rgb(40, 60, 110);
  const GLASS_CRACKED = k.rgb(110, 140, 190);
  const GOLD = k.rgb(209, 185, 72);
  const RED = k.rgb(122, 15, 31);
  const WATER = k.rgb(70, 110, 140);
  const WHITE = k.rgb(255, 255, 255);

  let state: State = 'ready';
  let bricks: Brick[] = [];
  let particles: Particle[] = [];
  let level = 1;
  let lives = 3;
  let score = 0;
  let best = loadBest();
  let broken = 0;
  let factIndex = Math.floor(Math.random() * data.facts.length);
  let fact = '';
  let factT = 0;
  let title = data.subtitle;
  let subtitle = '';
  let overT = 0;
  let time = 0;
  let bx = 0;
  let by = 0;
  let vx = 0;
  let vy = 0;
  let px = 0;
  let pvx = 0;
  let target = 0;
  let mouseControl = false;

  // Layout, all derived from the current canvas size.
  const H = () => k.height();
  const W = () => k.width();
  const margin = () => W() * 0.03;
  const bw = () => (W() - 2 * margin()) / COLS;
  const bh = () => Math.min(Math.max(bw() * 0.55, H() * 0.022), (H() * 0.46) / ROWS);
  const top = () => H() * 0.09;
  const waterY = () => H() * 0.9;
  const puntW = () => Math.min(W() * 0.24, Math.max(H() * 0.2, 90));
  const puntH = () => H() * 0.028;
  const puntTop = () => waterY() - puntH() * 0.6;
  const radius = () => Math.max(5, Math.min(W(), H()) * 0.013);
  const speed = () => Math.min(H() * 0.62, W() * 1.1) * (1 + 0.12 * (level - 1));

  function build(): void {
    bricks = [];
    data.bridge.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === '#' || ch === 'w' || ch === 'g') {
          bricks.push({ c, r, kind: ch, hp: ch === 'w' ? 2 : 1 });
        }
      });
    });
  }

  function brickRect(b: Brick) {
    return { x: margin() + b.c * bw(), y: top() + b.r * bh(), w: bw(), h: bh() };
  }

  function clampPunt(x: number): number {
    return Math.max(puntW() / 2, Math.min(W() - puntW() / 2, x));
  }

  function restart(): void {
    level = 1;
    lives = 3;
    score = 0;
    broken = 0;
    title = data.subtitle;
    subtitle = '';
    build();
    state = 'ready';
  }

  function launch(): void {
    if (state === 'over') {
      if (overT > 0.7) restart();
      return;
    }
    if (state !== 'ready') return;
    state = 'play';
    const a = ((Math.random() - 0.5) * Math.PI) / 3;
    vx = Math.sin(a) * speed();
    vy = -Math.cos(a) * speed();
    beep(440, 80, 'triangle', 0.08);
  }

  function burst(x: number, y: number, n: number, color: [number, number, number], up = 1): void {
    for (let i = 0; i < n; i++) {
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * H() * 0.5,
        vy: -Math.random() * H() * 0.5 * up,
        life: 0.6 + Math.random() * 0.5,
        size: H() * (0.004 + Math.random() * 0.006),
        color,
      });
    }
  }

  function showFact(): void {
    fact = data.facts[factIndex % data.facts.length];
    factIndex++;
    factT = 4;
  }

  function hitBrick(b: Brick): void {
    b.hp--;
    const r = brickRect(b);
    if (b.hp > 0) {
      beep(1400, 50, 'triangle', 0.06);
      burst(r.x + r.w / 2, r.y + r.h / 2, 4, [180, 200, 230]);
      return;
    }
    score += POINTS[b.kind] * level;
    broken++;
    const color: [number, number, number] =
      b.kind === 'g' ? [209, 185, 72] : b.kind === 'w' ? [60, 90, 150] : [...STONE];
    burst(r.x + r.w / 2, r.y + r.h / 2, 8, color);
    if (b.kind === 'g') {
      fanfare();
      showFact();
    } else {
      blip();
      if (broken % data.factEvery === 0) showFact();
    }
  }

  function loseBall(): void {
    burst(bx, waterY(), 14, [200, 225, 240], 1.4);
    boom(250, 0.15);
    lives--;
    if (lives <= 0) {
      state = 'over';
      overT = 0;
      title = pick(data.overs);
      if (score > best) {
        best = score;
        saveBest(best);
      }
      return;
    }
    state = 'ready';
    title = pick(data.splashes);
    subtitle = `${lives} ${lives === 1 ? 'ball' : 'balls'} left`;
  }

  function levelClear(): void {
    fanfare();
    level++;
    title = pick(data.clears);
    subtitle = `Level ${level}`;
    build();
    state = 'ready';
  }

  // One small step of ball movement against walls, punt and bricks.
  function step(dt: number): void {
    const r = radius();
    bx += vx * dt;
    by += vy * dt;
    if (bx < r) {
      bx = r;
      vx = Math.abs(vx);
    } else if (bx > W() - r) {
      bx = W() - r;
      vx = -Math.abs(vx);
    }
    if (by < r) {
      by = r;
      vy = Math.abs(vy);
    }

    // Punt: bounce angle from where the ball lands on the hull.
    const pt = puntTop();
    if (vy > 0 && by + r >= pt && by - r < pt + puntH() && Math.abs(bx - px) <= puntW() / 2 + r) {
      const rel = Math.max(-1, Math.min(1, (bx - px) / (puntW() / 2)));
      const a = (rel * Math.PI) / 3;
      vx = Math.sin(a) * speed();
      vy = -Math.cos(a) * speed();
      by = pt - r;
      beep(330, 60, 'triangle', 0.08);
    }

    for (const b of bricks) {
      if (b.hp <= 0) continue;
      const rc = brickRect(b);
      const cx = Math.max(rc.x, Math.min(bx, rc.x + rc.w));
      const cy = Math.max(rc.y, Math.min(by, rc.y + rc.h));
      const dx = bx - cx;
      const dy = by - cy;
      if (dx * dx + dy * dy > r * r) continue;
      // Reflect on the axis the ball came in through.
      if (dx === 0 && dy === 0) vy = -vy;
      else if (Math.abs(dx) / rc.w > Math.abs(dy) / rc.h) vx = Math.sign(dx) * Math.abs(vx);
      else vy = Math.sign(dy) * Math.abs(vy);
      hitBrick(b);
      break;
    }
  }

  k.onMouseMove(() => {
    mouseControl = true;
    target = k.mousePos().x;
  });
  k.onMousePress(() => {
    target = k.mousePos().x;
    launch();
  });
  k.onKeyPress(['space', 'up', 'w', 'enter'], launch);
  k.onKeyPress(['left', 'right', 'a', 'd'], () => {
    mouseControl = false;
  });
  build();
  px = target = W() / 2;

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 1 / 30) * slow;
    time += dt;
    factT -= dt;
    overT += dt;

    const prev = px;
    if (mouseControl) px = clampPunt(target);
    else {
      const dir =
        (k.isKeyDown('right') || k.isKeyDown('d') ? 1 : 0) -
        (k.isKeyDown('left') || k.isKeyDown('a') ? 1 : 0);
      px = clampPunt(px + dir * W() * 0.9 * dt);
    }
    pvx += ((px - prev) / Math.max(dt, 1e-3) - pvx) * Math.min(1, dt * 10);

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += H() * 1.5 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    if (state !== 'play') {
      bx = px;
      by = puntTop() - radius() - 1;
      return;
    }
    // Sub-steps of at most half a radius so the ball cannot tunnel through a brick.
    const dist = Math.hypot(vx, vy) * dt;
    const n = Math.max(1, Math.ceil(dist / (radius() * 0.5)));
    for (let i = 0; i < n && state === 'play'; i++) {
      step(dt / n);
      if (by > waterY() + puntH()) loseBall();
    }
    if (state === 'play' && bricks.every((b) => b.hp <= 0)) levelClear();
  });

  function drawScene(): void {
    const wy = waterY();
    k.drawRect({
      pos: k.vec2(0, 0),
      width: W(),
      height: wy,
      gradient: [k.rgb(120, 170, 215), k.rgb(225, 228, 220)],
    });
    // Willows on both banks.
    for (const [x, s] of [
      [W() * 0.04, 1],
      [W() * 0.96, -1],
    ]) {
      k.drawRect({
        pos: k.vec2(x - H() * 0.006, wy - H() * 0.16),
        width: H() * 0.012,
        height: H() * 0.16,
        color: k.rgb(90, 70, 50),
      });
      for (let i = 0; i < 5; i++) {
        k.drawEllipse({
          pos: k.vec2(x + s * (i - 2) * H() * 0.02, wy - H() * (0.15 - i * 0.01)),
          radiusX: H() * 0.035,
          radiusY: H() * 0.07,
          color: k.rgb(110 + i * 8, 160, 80),
          opacity: 0.9,
        });
      }
    }
    k.drawRect({ pos: k.vec2(0, wy), width: W(), height: H() - wy, color: WATER });
    // Ripples drifting downstream.
    const step = H() * 0.09;
    for (let row = 0; row < 3; row++) {
      const y = wy + (H() - wy) * (0.25 + row * 0.25);
      const off = (time * H() * 0.05 * (row + 1)) % step;
      for (let x = -step + off; x < W(); x += step) {
        k.drawLine({
          p1: k.vec2(x, y),
          p2: k.vec2(x + step * 0.4, y),
          width: 2,
          color: k.rgb(150, 190, 215),
          opacity: 0.6,
        });
      }
    }
    k.drawText({
      text: data.labels.river,
      pos: k.vec2(H() * 0.02, wy + (H() - wy) * 0.55),
      size: H() * 0.022,
      anchor: 'left',
      color: k.rgb(220, 235, 245),
    });
    const ly = top() + (ROWS + 0.8) * bh();
    const lsize = Math.min(H() * 0.02, W() * 0.03);
    k.drawText({
      text: data.labels.left,
      pos: k.vec2(margin(), ly),
      size: lsize,
      anchor: 'left',
      color: STONE_DARK,
    });
    k.drawText({
      text: data.labels.right,
      pos: k.vec2(W() - margin(), ly),
      size: lsize,
      anchor: 'right',
      color: STONE_DARK,
    });
  }

  function drawBricks(): void {
    for (const b of bricks) {
      if (b.hp <= 0) continue;
      const { x, y, w, h } = brickRect(b);
      if (b.kind === 'w') {
        k.drawRect({
          pos: k.vec2(x, y),
          width: w,
          height: h,
          color: b.hp > 1 ? GLASS : GLASS_CRACKED,
          outline: { width: 1, color: STONE_DARK },
        });
        // Tracery bars, and a crack once hit.
        k.drawLine({
          p1: k.vec2(x + w / 2, y),
          p2: k.vec2(x + w / 2, y + h),
          width: 1.5,
          color: k.rgb(...STONE),
        });
        if (b.hp === 1) {
          k.drawLine({
            p1: k.vec2(x + w * 0.15, y + h * 0.2),
            p2: k.vec2(x + w * 0.85, y + h * 0.8),
            width: 1,
            color: WHITE,
          });
        }
        continue;
      }
      if (b.kind === 'g') {
        k.drawRect({
          pos: k.vec2(x, y),
          width: w,
          height: h,
          color: GOLD,
          outline: { width: 1.5, color: RED },
        });
        continue;
      }
      // Stone with a little per-brick shade variation.
      const shade = (((b.c * 7 + b.r * 13) % 3) - 1) * 10;
      k.drawRect({
        pos: k.vec2(x, y),
        width: w,
        height: h,
        color: k.rgb(STONE[0] + shade, STONE[1] + shade, STONE[2] + shade),
        outline: { width: 1, color: STONE_DARK },
      });
    }
  }

  function drawPunt(): void {
    const pw = puntW();
    const ph = puntH();
    const pt = puntTop();
    // Student standing on the till at the stern, pole leaning against the motion.
    const sx = px + pw * 0.32;
    const sh = H() * 0.08;
    const tilt = Math.max(-0.5, Math.min(0.5, -pvx / (W() * 2))) + 0.25;
    const hand = k.vec2(sx - sh * 0.15, pt - sh * 0.6);
    const dir = k.vec2(Math.sin(tilt), Math.cos(tilt));
    const len = H() * 0.26;
    k.drawLine({
      p1: hand.sub(dir.scale(len * 0.35)),
      p2: hand.add(dir.scale(len * 0.65)),
      width: Math.max(2, H() * 0.006),
      color: k.rgb(170, 130, 80),
    });
    // Legs, gown, LMBC red scarf, head.
    k.drawRect({
      pos: k.vec2(sx - sh * 0.12, pt - sh * 0.35),
      width: sh * 0.24,
      height: sh * 0.35,
      color: k.rgb(40, 40, 50),
    });
    k.drawRect({
      pos: k.vec2(sx - sh * 0.18, pt - sh * 0.78),
      width: sh * 0.36,
      height: sh * 0.48,
      color: k.rgb(20, 20, 26),
      radius: sh * 0.06,
    });
    k.drawRect({
      pos: k.vec2(sx - sh * 0.16, pt - sh * 0.8),
      width: sh * 0.32,
      height: sh * 0.09,
      color: RED,
    });
    k.drawRect({
      pos: k.vec2(sx + sh * 0.05, pt - sh * 0.8),
      width: sh * 0.08,
      height: sh * 0.3,
      color: RED,
    });
    const head = k.vec2(sx, pt - sh * 0.93);
    const hr = sh * 0.16;
    if (punter && k.getSprite('punter')?.data) {
      k.drawSprite({
        sprite: 'punter',
        pos: head,
        width: hr * 2.2,
        height: hr * 2.2,
        anchor: 'center',
      });
    } else {
      k.drawCircle({ pos: head, radius: hr, color: k.rgb(235, 200, 170) });
    }
    // Hull with a darker gunwale and the till at the stern.
    k.drawRect({
      pos: k.vec2(px - pw / 2, pt),
      width: pw,
      height: ph,
      color: k.rgb(120, 80, 45),
      radius: ph * 0.3,
    });
    k.drawRect({
      pos: k.vec2(px - pw / 2, pt),
      width: pw,
      height: ph * 0.3,
      color: k.rgb(80, 50, 28),
    });
    k.drawRect({
      pos: k.vec2(px + pw * 0.2, pt - ph * 0.15),
      width: pw * 0.3,
      height: ph * 0.3,
      color: k.rgb(150, 105, 60),
    });
  }

  function drawHud(): void {
    const size = H() * 0.035;
    const y = H() * 0.025;
    const shadowed = (text: string, x: number, anchor: 'topleft' | 'top' | 'topright') => {
      k.drawText({
        text,
        pos: k.vec2(x + 2, y + 2),
        size,
        anchor,
        color: k.rgb(0, 0, 0),
        opacity: 0.4,
      });
      k.drawText({ text, pos: k.vec2(x, y), size, anchor, color: WHITE });
    };
    shadowed(String(score), H() * 0.02, 'topleft');
    shadowed(`Level ${level}`, W() / 2, 'top');
    for (let i = 0; i < lives; i++) {
      k.drawCircle({
        pos: k.vec2(W() - H() * 0.03 - i * H() * 0.035, y + size / 2),
        radius: H() * 0.012,
        color: GOLD,
        outline: { width: 1.5, color: RED },
      });
    }

    if (factT > 0 && state === 'play') {
      const bw = Math.min(W() * 0.92, H() * 0.95);
      const fy = H() * 0.66;
      const o = Math.min(1, factT);
      k.drawRect({
        pos: k.vec2(W() / 2, fy),
        width: bw,
        height: H() * 0.1,
        anchor: 'center',
        color: RED,
        outline: { width: 3, color: GOLD },
        radius: 8,
        opacity: o,
      });
      k.drawText({
        text: fact,
        pos: k.vec2(W() / 2, fy),
        size: Math.min(H() * 0.026, W() * 0.04),
        width: bw * 0.92,
        align: 'center',
        anchor: 'center',
        color: WHITE,
        opacity: o,
      });
    }

    if (state === 'play') return;
    const lines =
      state === 'ready'
        ? [title, subtitle, data.intro].filter(Boolean)
        : [title, `Score ${score}   Best ${best}`, overT > 0.7 ? data.restart : ''];
    const bw = Math.min(W() * 0.92, H() * 0.95);
    const cy = H() * 0.7;
    k.drawRect({
      pos: k.vec2(W() / 2, cy),
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
        pos: k.vec2(W() / 2, cy + H() * (i - (lines.length - 1) / 2) * 0.065),
        size: Math.min(H() * (i === 0 ? 0.03 : 0.024), W() * (i === 0 ? 0.042 : 0.034)),
        width: bw * 0.92,
        align: 'center',
        anchor: 'center',
        color: i === 0 ? GOLD : WHITE,
      });
    });
  }

  k.onDraw(() => {
    drawScene();
    drawBricks();
    drawPunt();
    k.drawCircle({
      pos: k.vec2(bx, by),
      radius: radius(),
      color: GOLD,
      outline: { width: 2, color: RED },
    });
    for (const p of particles) {
      k.drawRect({
        pos: k.vec2(p.x, p.y),
        width: p.size,
        height: p.size,
        anchor: 'center',
        color: k.rgb(...p.color),
        opacity: Math.min(1, p.life * 2),
      });
    }
    drawHud();
  });
}
