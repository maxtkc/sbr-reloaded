// Doodle Jump: climb the Chapel tower on benches, gowns and sherry glasses while the Porters patrol.
import type { KAPLAYCtx } from 'kaplay';
import { startKaplay } from '../../chaos/shared/kaplay';
import { beep, boom, fanfare, siren } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  slug: string;
  face: string;
}

type Kind = keyof typeof data.platforms;
type ItemKind = keyof typeof data.items;
type State = 'ready' | 'play' | 'dead';
type Death = keyof typeof data.deaths;

interface Platform {
  x: number;
  y: number;
  w: number;
  kind: Kind | 'floor';
  vx: number;
  broken: boolean;
  fallY: number;
  fallV: number;
  item?: { kind: ItemKind; off: number; used: number };
}

interface Porter {
  head: boolean;
  x: number;
  y: number;
  plat?: Platform;
  off: number;
  dir: number;
  baseY: number;
  phase: number;
  dead: boolean;
  vy: number;
  rot: number;
  shoutT: number;
  sayT: number;
  say: string;
  seen: boolean;
}

// World units: the play column is 10 wide, y is up.
const COL = 10;
const GRAVITY = 40;
const JUMP = 22;
const PORT_JUMP = JUMP * 1.75;
const BOOST_V = 28;
const BOOST_T = 2.2;
const RUN = 13;
const PLAYER_W = 0.8;
const PLAYER_H = 1.4;
const PORTER_W = 0.9;
const PORTER_H = 1.7;
const WIDTHS: Record<Kind, number> = { bench: 2.6, gown: 2.2, glass: 1.1 };
const MPU = data.metresPerUnit;
const TOP = data.towerTop / MPU;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// Shortest horizontal distance across the wrapping column.
const wrapDx = (a: number, b: number) => {
  let d = a - b;
  if (d > COL / 2) d -= COL;
  if (d < -COL / 2) d += COL;
  return d;
};
// Deterministic 0..1 noise for stars and stonework.
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
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
    return Number(localStorage.getItem('doodle-jump-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('doodle-jump-best', String(n));
  } catch {
    // Storage unavailable.
  }
}

export default function start(root: HTMLElement): () => void {
  let stop: (() => void) | undefined;
  let stopped = false;
  startKaplay(root, { background: [150, 196, 230], pixelDensity: devicePixelRatio }).then((ctx) => {
    if (stopped) return ctx.stop();
    const end = run(ctx.k, root);
    stop = () => {
      end();
      ctx.stop();
    };
  });
  return () => {
    stopped = true;
    stop?.();
  };
}

function run(k: KAPLAYCtx, root: HTMLElement): () => void {
  const jumper = pick(readRoster().filter((m) => m.face));
  if (jumper) k.loadSprite('jumper', jumper.face);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const RED = k.rgb(122, 15, 31);
  const SCARF = k.rgb(227, 38, 28);
  const GOLD = k.rgb(209, 185, 72);
  const WHITE = k.rgb(255, 255, 255);
  const BLACK = k.rgb(20, 20, 26);
  const STONE = k.rgb(206, 190, 150);
  const STONE_DARK = k.rgb(150, 132, 92);
  const GLASS = k.rgb(40, 60, 110);
  const WOOD = k.rgb(122, 80, 42);
  const WOOD_DARK = k.rgb(80, 50, 26);
  const SKIN = k.rgb(235, 200, 170);
  const SUIT = k.rgb(28, 34, 56);
  const SHERRY = k.rgb(196, 120, 40);
  const PORT = k.rgb(110, 12, 36);
  const GRASS = k.rgb(70, 140, 60);

  let state: State = 'ready';
  let px = COL / 2;
  let py = 0;
  let vx = 0;
  let vy = 0;
  let camY = -2;
  let maxY = 0;
  let boostT = 0;
  let time = 0;
  let deadT = 0;
  let death: Death = 'fell';
  let deathLine = '';
  let best = loadBest();
  let stomped = 0;
  let nextFact = data.factEvery;
  let factIndex = Math.floor(Math.random() * data.facts.length);
  let milestone = 0;
  let msg = '';
  let msgT = 0;
  let msgGold = false;
  let sirenT = 0;
  let platforms: Platform[] = [];
  let porters: Porter[] = [];
  let topY = 0;
  let lastPorter = false;
  let nextHead = 0;

  // Tilt input: gamma in degrees once the device reports it.
  let tilt: number | null = null;
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma !== null) tilt = e.gamma;
  };
  addEventListener('deviceorientation', onTilt);
  // iOS only grants orientation from inside a user gesture.
  const canvas = root.querySelector('canvas');
  const askTilt = () => {
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    DOE.requestPermission?.().catch(() => {});
  };
  canvas?.addEventListener('pointerdown', askTilt, { once: true });

  const H = () => k.height();
  const W = () => k.width();
  const colW = () => Math.min(W(), H() * 0.6);
  const colL = () => (W() - colW()) / 2;
  const s = () => colW() / COL;
  const viewH = () => H() / s();
  const X = (x: number) => colL() + x * s();
  const Y = (y: number) => H() - (y - camY) * s();
  const metres = () => Math.floor(maxY * MPU);

  function reset(): void {
    state = 'ready';
    px = COL / 2;
    py = 0;
    vx = 0;
    vy = 0;
    camY = -2;
    maxY = 0;
    boostT = 0;
    stomped = 0;
    nextFact = data.factEvery;
    milestone = 0;
    msgT = 0;
    platforms = [{ x: 0, y: 0, w: COL, kind: 'floor', vx: 0, broken: false, fallY: 0, fallV: 0 }];
    porters = [];
    topY = 0;
    lastPorter = false;
    nextHead = data.headPorterFrom / MPU;
    generate();
  }

  function weighted(t: number): Kind {
    const entries = Object.entries(data.platforms) as [Kind, number[]][];
    const ws = entries.map(([, [a, b]]) => lerp(a, b, t));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < entries.length; i++) {
      r -= ws[i];
      if (r <= 0) return entries[i][0];
    }
    return 'bench';
  }

  function newPorter(head: boolean, y: number, plat?: Platform): Porter {
    return {
      head,
      x: plat ? plat.x + plat.w / 2 : COL / 2,
      y,
      plat,
      off: plat ? rand(0.45, plat.w - 0.45) : 0,
      dir: Math.random() < 0.5 ? -1 : 1,
      baseY: y,
      phase: rand(0, Math.PI * 2),
      dead: false,
      vy: 0,
      rot: 0,
      shoutT: rand(0.3, 1.5),
      sayT: 0,
      say: '',
      seen: false,
    };
  }

  // Adds platforms up to just above the top of the screen. Gaps stay under the jump height.
  function generate(): void {
    while (topY < camY + viewH() + 4) {
      const t = clamp((topY * MPU) / 300, 0, 1);
      const y = topY + rand(lerp(1, 2.2, t), lerp(2.6, 4.8, t));
      const kind = weighted(t);
      const w = kind === 'bench' ? lerp(WIDTHS.bench, 2, t) : WIDTHS[kind];
      const p: Platform = {
        x: rand(0, COL - w),
        y,
        w,
        kind,
        vx: kind === 'gown' ? rand(1.2, 1.8 + t * 1.5) * (Math.random() < 0.5 ? -1 : 1) : 0,
        broken: false,
        fallY: 0,
        fallV: 0,
      };
      const hm = y * MPU;
      let porter = false;
      if (kind === 'bench' && hm > 5) {
        const r = Math.random();
        if (r < data.items.mortarboard)
          p.item = { kind: 'mortarboard', off: rand(0.4, w - 0.4), used: 0 };
        else if (r < data.items.mortarboard + data.items.port) {
          p.item = { kind: 'port', off: rand(0.4, w - 0.4), used: 0 };
        }
      }
      if (kind === 'bench' && !p.item && !lastPorter && hm >= data.porterFrom) {
        const [a, b] = data.porterChance;
        if (Math.random() < lerp(a, b, t)) {
          porters.push(newPorter(false, y, p));
          porter = true;
        }
      }
      lastPorter = porter;
      platforms.push(p);
      if (y > nextHead) {
        porters.push(newPorter(true, y + 2.5));
        nextHead = y + rand(70, 110);
      }
      topY = y;
    }
  }

  function message(text: string, gold = false): void {
    msg = text;
    msgT = 4;
    msgGold = gold;
  }

  function die(cause: Death): void {
    if (state !== 'play') return;
    state = 'dead';
    death = cause;
    deadT = 0;
    deathLine = pick(data.deaths[cause]);
    boostT = 0;
    if (cause === 'porter') {
      vy = JUMP * 0.4;
      siren(750);
    } else boom(350, 0.25);
    if (metres() > best) {
      best = metres();
      saveBest(best);
    }
  }

  function press(): void {
    if (state === 'ready') state = 'play';
    else if (state === 'dead' && deadT > 0.7) reset();
  }

  function steer(): number {
    let dir =
      (k.isKeyDown('right') || k.isKeyDown('d') ? 1 : 0) -
      (k.isKeyDown('left') || k.isKeyDown('a') ? 1 : 0);
    if (!dir && k.isMouseDown()) dir = k.mousePos().x < W() / 2 ? -1 : 1;
    if (tilt !== null && Math.abs(tilt) > 3) dir = clamp(tilt / 20, -1, 1);
    return dir;
  }

  k.onKeyPress(['space', 'enter', 'left', 'right', 'a', 'd'], press);
  k.onMousePress(press);

  function land(p: Platform): void {
    vy = JUMP;
    if (p.item?.kind === 'port' && Math.abs(wrapDx(px, p.x + p.item.off)) < 0.6) {
      vy = PORT_JUMP;
      p.item.used = 1;
      [500, 700, 950].forEach((f, i) => beep(f, 70, 'triangle', 0.07, i * 50));
      return;
    }
    if (p.kind === 'glass') {
      p.broken = true;
      beep(2400, 50, 'triangle', 0.05);
      beep(1900, 80, 'triangle', 0.04, 50);
    } else beep(p.kind === 'gown' ? 330 : 420, 50, 'triangle', 0.06);
  }

  function updatePlayer(dt: number): void {
    const dir = steer();
    if (dir && state === 'ready') state = 'play';
    vx += (dir * RUN - vx) * Math.min(1, dt * 10);
    if (state !== 'dead') px = (((px + vx * dt) % COL) + COL) % COL;
    const prev = py;
    if (boostT > 0) {
      boostT -= dt;
      vy = BOOST_V;
    } else vy -= GRAVITY * dt;
    py += vy * dt;
    if (state === 'dead') return;

    if (vy < 0) {
      for (const p of platforms) {
        if (p.broken || prev < p.y - 0.01 || py > p.y) continue;
        if (state === 'ready' && p.kind !== 'floor') continue;
        if (Math.abs(wrapDx(px, p.x + p.w / 2)) > p.w / 2 + PLAYER_W * 0.4) continue;
        py = p.y;
        land(p);
        break;
      }
    }
    // Mortarboard pickup.
    for (const p of platforms) {
      const it = p.item;
      if (it?.kind !== 'mortarboard' || it.used) continue;
      if (Math.abs(wrapDx(px, p.x + it.off)) < 0.7 && py < p.y + 1 && py + PLAYER_H > p.y) {
        it.used = 1;
        boostT = BOOST_T;
        [600, 800, 1000, 1200].forEach((f, i) => beep(f, 60, 'square', 0.05, i * 40));
      }
    }
    // Porters: land on the hat, or get caught.
    if (boostT <= 0) {
      for (const q of porters) {
        if (q.dead || Math.abs(wrapDx(px, q.x)) > (PORTER_W + PLAYER_W) / 2) continue;
        if (py > q.y + PORTER_H || py + PLAYER_H < q.y) continue;
        if (vy < 0 && prev >= q.y + PORTER_H * 0.6) {
          q.dead = true;
          q.vy = 4;
          vy = JUMP * 1.1;
          stomped++;
          boom(150, 0.15);
          beep(300, 120, 'sawtooth', 0.05);
        } else die('porter');
        break;
      }
    }
    if (state === 'play') maxY = Math.max(maxY, py);
    if (state === 'play') camY = Math.max(camY, py - viewH() * 0.45);
    if (py < camY - 1.5) die('fell');
  }

  function updateWorld(dt: number): void {
    for (const p of platforms) {
      if (p.kind === 'gown' && !p.broken) {
        p.x += p.vx * dt;
        if (p.x < 0 || p.x + p.w > COL) {
          p.vx = -p.vx;
          p.x = clamp(p.x, 0, COL - p.w);
        }
      }
      if (p.broken) {
        p.fallV -= GRAVITY * dt;
        p.fallY += p.fallV * dt;
      }
      if (p.item?.used && p.item.kind === 'port')
        p.item.used = Math.max(0.001, p.item.used - dt * 3);
    }
    for (const q of porters) {
      if (q.dead) {
        q.vy -= GRAVITY * dt;
        q.y += q.vy * dt;
        q.rot += 420 * dt;
        continue;
      }
      if (q.head) {
        q.x = COL / 2 + 3.8 * Math.sin(time * 0.7 + q.phase);
        q.y = q.baseY + Math.sin(time * 1.3 + q.phase) * 0.6;
      } else if (q.plat) {
        q.off += q.dir * 1.2 * dt;
        if (q.off < 0.45 || q.off > q.plat.w - 0.45) {
          q.dir = -q.dir;
          q.off = clamp(q.off, 0.45, q.plat.w - 0.45);
        }
        q.x = q.plat.x + q.off;
        q.y = q.plat.y;
      }
      const onScreen = q.y > camY && q.y < camY + viewH();
      if (!onScreen) continue;
      if (!q.seen) {
        q.seen = true;
        if (sirenT <= 0 && state === 'play') {
          siren(500);
          sirenT = 3;
        }
      }
      q.sayT -= dt;
      q.shoutT -= dt;
      if (q.shoutT <= 0) {
        q.say = pick(q.head ? data.headShouts : data.shouts);
        q.sayT = 1.8;
        q.shoutT = rand(2.5, 4.5);
      }
    }
    const floor = camY - 4;
    platforms = platforms.filter((p) => p.y + p.fallY > floor);
    porters = porters.filter((q) => q.y > floor);
    generate();
  }

  function updateMessages(dt: number): void {
    msgT -= dt;
    const m = metres();
    const ms = data.milestones[milestone];
    if (ms && m >= ms.m) {
      milestone++;
      message(ms.text, true);
      fanfare();
    } else if (m >= nextFact) {
      nextFact += data.factEvery;
      if (msgT < 1) message(data.facts[factIndex++ % data.facts.length]);
    }
  }

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 1 / 30) * slow;
    time += dt;
    sirenT -= dt;
    if (state === 'dead') deadT += dt;
    updatePlayer(dt);
    updateWorld(dt);
    if (state === 'play') updateMessages(dt);
  });

  function drawBackground(): void {
    const hm = (camY + viewH() / 2) * MPU;
    const t = clamp(hm / 300, 0, 1);
    const sky = k.rgb(lerp(150, 10, t), lerp(196, 14, t), lerp(230, 44, t));
    k.drawRect({ pos: k.vec2(0, 0), width: W(), height: H(), color: sky });
    if (t > 0.3) {
      for (let i = 0; i < 80; i++) {
        const sx = hash(i) * W();
        const sy = (((hash(i + 99) * H() * 2 + camY * s() * 0.1) % H()) + H()) % H();
        k.drawCircle({
          pos: k.vec2(sx, sy),
          radius: 1 + hash(i + 7) * 1.5,
          color: WHITE,
          opacity: (t - 0.3) * 1.4 * (0.5 + 0.5 * Math.sin(time * 2 + i)),
        });
      }
    }
  }

  function drawTower(): void {
    const sz = s();
    const top = Y(TOP);
    if (top > H()) return drawPinnacles();
    const y0 = Math.max(0, top);
    const bottom = Math.min(H(), Y(0));
    k.drawRect({ pos: k.vec2(colL(), y0), width: colW(), height: bottom - y0, color: STONE });
    // Stone courses.
    for (let u = Math.ceil(camY); u < Math.min(TOP, camY + viewH() + 1); u++) {
      if (u < 0) continue;
      k.drawLine({
        p1: k.vec2(colL(), Y(u)),
        p2: k.vec2(colL() + colW(), Y(u)),
        width: 1,
        color: STONE_DARK,
        opacity: 0.35,
      });
    }
    // Lancet windows every 12 units.
    for (let u = Math.floor(camY / 12) * 12; u < camY + viewH() + 12; u += 12) {
      if (u < 2 || u + 7 > TOP - 4) continue;
      for (const wx of [2.5, 7.5]) {
        const l = X(wx - 0.7);
        const r = X(wx + 0.7);
        k.drawRect({ pos: k.vec2(l, Y(u + 5)), width: r - l, height: 5 * sz, color: GLASS });
        k.drawTriangle({
          p1: k.vec2(l, Y(u + 5)),
          p2: k.vec2(r, Y(u + 5)),
          p3: k.vec2((l + r) / 2, Y(u + 6.4)),
          color: GLASS,
        });
        k.drawLine({
          p1: k.vec2((l + r) / 2, Y(u)),
          p2: k.vec2((l + r) / 2, Y(u + 6)),
          width: 2,
          color: STONE_DARK,
        });
      }
    }
    // Buttresses at the edges.
    for (const bx of [0, COL - 0.6]) {
      k.drawRect({
        pos: k.vec2(X(bx), y0),
        width: 0.6 * sz,
        height: bottom - y0,
        color: STONE_DARK,
        opacity: 0.5,
      });
    }
    drawPinnacles();
  }

  // Battlements and the four corner pinnacles at the top of the tower.
  function drawPinnacles(): void {
    const sz = s();
    const top = Y(TOP);
    if (top < -6 * sz || top > H() + 6 * sz) return;
    for (let mx = 0; mx < COL; mx += 1.6) {
      k.drawRect({
        pos: k.vec2(X(mx), top - 0.8 * sz),
        width: 0.8 * sz,
        height: 0.8 * sz,
        color: STONE,
      });
    }
    for (const cx of [0.3, 3.3, 6.7, 9.7]) {
      k.drawRect({
        pos: k.vec2(X(cx - 0.3), top - 4 * sz),
        width: 0.6 * sz,
        height: 4 * sz,
        color: STONE,
        outline: { width: 1, color: STONE_DARK },
      });
      k.drawTriangle({
        p1: k.vec2(X(cx - 0.4), top - 4 * sz),
        p2: k.vec2(X(cx + 0.4), top - 4 * sz),
        p3: k.vec2(X(cx), top - 6 * sz),
        color: STONE_DARK,
      });
    }
  }

  function drawGround(): void {
    const g = Y(0);
    if (g > H()) return;
    const sz = s();
    k.drawRect({ pos: k.vec2(0, g), width: W(), height: H() - g, color: GRASS });
    k.drawRect({ pos: k.vec2(0, g), width: W(), height: 0.2 * sz, color: k.rgb(170, 160, 140) });
    // Keep off the grass sign.
    const sx = X(8.4);
    k.drawLine({
      p1: k.vec2(sx, g + 0.3 * sz),
      p2: k.vec2(sx, g + 1.6 * sz),
      width: 3,
      color: WOOD_DARK,
    });
    k.drawRect({
      pos: k.vec2(sx, g + 0.6 * sz),
      width: 2.6 * sz,
      height: 0.7 * sz,
      anchor: 'center',
      color: WHITE,
      outline: { width: 2, color: BLACK },
    });
    k.drawText({
      text: 'KEEP OFF THE GRASS',
      pos: k.vec2(sx, g + 0.6 * sz),
      size: 0.24 * sz,
      anchor: 'center',
      color: BLACK,
    });
  }

  function drawPlatform(p: Platform): void {
    if (p.kind === 'floor') return;
    const sz = s();
    const x = X(p.x);
    const w = p.w * sz;
    const y = Y(p.y + p.fallY);
    if (y < -2 * sz || y > H() + 2 * sz) return;
    if (p.kind === 'bench') {
      k.drawRect({ pos: k.vec2(x, y), width: w, height: 0.3 * sz, color: WOOD, radius: 2 });
      for (const lx of [0.25, p.w - 0.4]) {
        k.drawRect({
          pos: k.vec2(x + lx * sz, y + 0.3 * sz),
          width: 0.15 * sz,
          height: 0.5 * sz,
          color: WOOD_DARK,
        });
      }
    } else if (p.kind === 'gown') {
      // A gown on a coat hanger, sleeves hanging off both ends.
      const mid = x + w / 2;
      k.drawLine({
        p1: k.vec2(x + w * 0.15, y),
        p2: k.vec2(mid, y - 0.4 * sz),
        width: 2,
        color: STONE_DARK,
      });
      k.drawLine({
        p1: k.vec2(x + w * 0.85, y),
        p2: k.vec2(mid, y - 0.4 * sz),
        width: 2,
        color: STONE_DARK,
      });
      k.drawLine({
        p1: k.vec2(mid, y - 0.4 * sz),
        p2: k.vec2(mid, y - 0.6 * sz),
        width: 2,
        color: STONE_DARK,
      });
      k.drawCircle({
        pos: k.vec2(mid + 0.08 * sz, y - 0.6 * sz),
        radius: 0.08 * sz,
        fill: false,
        outline: { width: 2, color: STONE_DARK },
      });
      k.drawRect({ pos: k.vec2(x, y), width: w, height: 0.35 * sz, color: BLACK, radius: 3 });
      for (const side of [0, 1]) {
        const ex = side ? x + w : x;
        const d = side ? -1 : 1;
        k.drawTriangle({
          p1: k.vec2(ex, y),
          p2: k.vec2(ex + d * 0.5 * sz, y + 0.3 * sz),
          p3: k.vec2(ex - d * 0.15 * sz, y + 1 * sz + Math.sin(time * 6 + side) * 0.1 * sz),
          color: BLACK,
        });
      }
      k.drawRect({ pos: k.vec2(x + w * 0.42, y), width: w * 0.16, height: 0.35 * sz, color: RED });
    } else {
      // Sherry glass: rim at the platform top.
      const cx = x + w / 2;
      k.pushTransform();
      k.pushTranslate(k.vec2(cx, y));
      if (p.broken) k.pushRotate(p.fallY * -20);
      const pts = [
        k.vec2(-w / 2, 0),
        k.vec2(w / 2, 0),
        k.vec2(w * 0.12, 0.7 * sz),
        k.vec2(-w * 0.12, 0.7 * sz),
      ];
      k.drawPolygon({ pts, color: WHITE, opacity: 0.55, outline: { width: 2, color: WHITE } });
      if (!p.broken) {
        k.drawPolygon({
          pts: [
            k.vec2(-w * 0.4, 0.12 * sz),
            k.vec2(w * 0.4, 0.12 * sz),
            k.vec2(w * 0.12, 0.7 * sz),
            k.vec2(-w * 0.12, 0.7 * sz),
          ],
          color: SHERRY,
        });
      }
      k.drawLine({ p1: k.vec2(0, 0.7 * sz), p2: k.vec2(0, 1.1 * sz), width: 2, color: WHITE });
      k.drawEllipse({
        pos: k.vec2(0, 1.1 * sz),
        radiusX: w * 0.25,
        radiusY: 0.06 * sz,
        color: WHITE,
      });
      k.popTransform();
    }
    const it = p.item;
    if (!it) return;
    const ix = X(p.x + it.off);
    if (it.kind === 'port') {
      // Decanter, squashed for a moment after a bounce.
      const sq = 1 - it.used * 0.4;
      k.drawCircle({ pos: k.vec2(ix, y - 0.35 * sz * sq), radius: 0.35 * sz, color: PORT });
      k.drawRect({
        pos: k.vec2(ix, y - 0.75 * sz * sq),
        width: 0.18 * sz,
        height: 0.4 * sz * sq,
        anchor: 'center',
        color: PORT,
      });
      k.drawCircle({ pos: k.vec2(ix, y - 1 * sz * sq), radius: 0.12 * sz, color: GLASS });
    } else if (!it.used) {
      drawMortarboard(ix, y - (0.7 + Math.sin(time * 4) * 0.12) * sz, 0);
    }
  }

  function drawMortarboard(x: number, y: number, spin: number): void {
    const sz = s();
    k.drawRect({
      pos: k.vec2(x, y + 0.12 * sz),
      width: 0.5 * sz,
      height: 0.2 * sz,
      anchor: 'center',
      color: BLACK,
    });
    k.drawPolygon({
      pts: [
        k.vec2(x - 0.55 * sz, y),
        k.vec2(x, y - 0.18 * sz),
        k.vec2(x + 0.55 * sz, y),
        k.vec2(x, y + 0.18 * sz),
      ],
      color: BLACK,
    });
    const a = spin ? time * 25 : 0.6;
    k.drawLine({
      p1: k.vec2(x, y),
      p2: k.vec2(x + Math.cos(a) * 0.5 * sz, y + Math.abs(Math.sin(a)) * 0.35 * sz),
      width: 2,
      color: GOLD,
    });
  }

  function drawPorter(q: Porter): void {
    const sz = s() * (q.head ? 1.15 : 1);
    const x = X(q.x);
    const y = Y(q.y);
    if (y < -3 * sz || y > H() + 3 * sz) return;
    if (q.head) {
      k.drawLine({ p1: k.vec2(x, 0), p2: k.vec2(x, y - 2.1 * sz), width: 2, color: STONE_DARK });
    }
    k.pushTransform();
    k.pushTranslate(k.vec2(x, y));
    if (q.dead) k.pushRotate(q.rot);
    for (const lx of [-0.25, 0.1]) {
      k.drawRect({
        pos: k.vec2(lx * sz, -0.4 * sz),
        width: 0.15 * sz,
        height: 0.4 * sz,
        color: SUIT,
      });
    }
    k.drawRect({
      pos: k.vec2(-0.4 * sz, -1.3 * sz),
      width: 0.8 * sz,
      height: 0.95 * sz,
      color: SUIT,
      radius: 3,
    });
    k.drawRect({
      pos: k.vec2(-0.05 * sz, -1.3 * sz),
      width: 0.1 * sz,
      height: 0.5 * sz,
      color: q.head ? GOLD : RED,
    });
    k.drawCircle({ pos: k.vec2(0, -1.55 * sz), radius: 0.25 * sz, color: SKIN });
    // Bowler hat.
    k.drawEllipse({
      pos: k.vec2(0, -1.72 * sz),
      radiusX: 0.34 * sz,
      radiusY: 0.07 * sz,
      color: BLACK,
    });
    k.drawCircle({ pos: k.vec2(0, -1.78 * sz), radius: 0.2 * sz, color: BLACK });
    if (q.head) {
      k.drawRect({
        pos: k.vec2(-0.2 * sz, -1.8 * sz),
        width: 0.4 * sz,
        height: 0.06 * sz,
        color: GOLD,
      });
    }
    k.popTransform();
  }

  function drawBubble(q: Porter): void {
    if (q.dead || q.sayT <= 0) return;
    const sz = s();
    const size = Math.max(11, 0.38 * sz);
    const bw = Math.min(colW() * 0.62, 6 * sz);
    const lines = Math.ceil((q.say.length * size * 0.6) / (bw * 0.9));
    const bh = lines * size * 1.25 + size * 0.6;
    const hx = X(q.x);
    const hy = Y(q.y) - 2.1 * sz;
    const bx = clamp(hx, colL() + bw / 2 + 4, colL() + colW() - bw / 2 - 4);
    const by = hy - bh / 2 - 0.3 * sz;
    k.drawTriangle({
      p1: k.vec2(hx - 0.2 * sz, by + bh / 2 - 1),
      p2: k.vec2(hx + 0.2 * sz, by + bh / 2 - 1),
      p3: k.vec2(hx, hy),
      color: WHITE,
    });
    k.drawRect({
      pos: k.vec2(bx, by),
      width: bw,
      height: bh,
      anchor: 'center',
      color: WHITE,
      outline: { width: 2, color: BLACK },
      radius: 6,
    });
    k.drawText({
      text: q.say,
      pos: k.vec2(bx, by),
      size,
      width: bw * 0.9,
      align: 'center',
      anchor: 'center',
      color: BLACK,
    });
  }

  function drawPlayerAt(x: number): void {
    const sz = s();
    const y = Y(py);
    const flare = vy > 0 ? 0.15 : 0;
    // Legs, gown, scarf, roster face.
    for (const lx of [-0.18, 0.06]) {
      k.drawRect({
        pos: k.vec2(x + lx * sz, y - 0.3 * sz),
        width: 0.12 * sz,
        height: 0.3 * sz,
        color: BLACK,
      });
    }
    k.drawPolygon({
      pts: [
        k.vec2(x - 0.2 * sz, y - 1.05 * sz),
        k.vec2(x + 0.2 * sz, y - 1.05 * sz),
        k.vec2(x + (0.42 + flare) * sz, y - 0.25 * sz),
        k.vec2(x - (0.42 + flare) * sz, y - 0.25 * sz),
      ],
      color: BLACK,
    });
    k.drawRect({
      pos: k.vec2(x, y - 1.02 * sz),
      width: 0.46 * sz,
      height: 0.1 * sz,
      anchor: 'center',
      color: SCARF,
    });
    k.drawRect({
      pos: k.vec2(x + 0.1 * sz, y - 0.95 * sz),
      width: 0.09 * sz,
      height: 0.35 * sz + Math.sin(time * 10) * 0.05 * sz,
      color: SCARF,
    });
    const head = k.vec2(x, y - 1.32 * sz);
    if (jumper && k.getSprite('jumper')?.data) {
      k.drawSprite({
        sprite: 'jumper',
        pos: head,
        width: 0.6 * sz,
        height: 0.6 * sz,
        anchor: 'center',
      });
    } else {
      k.drawCircle({ pos: head, radius: 0.28 * sz, color: SKIN });
    }
    if (boostT > 0) drawMortarboard(x, y - 1.66 * sz, 1);
  }

  function drawPlayer(): void {
    const x = X(px);
    if (state === 'dead' && death === 'porter') {
      k.pushTransform();
      k.pushTranslate(k.vec2(x, Y(py) - 0.7 * s()));
      k.pushRotate(deadT * 300);
      k.pushTranslate(k.vec2(-x, -(Y(py) - 0.7 * s())));
      drawPlayerAt(x);
      k.popTransform();
      return;
    }
    drawPlayerAt(x);
    // Copy on the far side while wrapping.
    if (px < 0.6) drawPlayerAt(x + colW());
    if (px > COL - 0.6) drawPlayerAt(x - colW());
  }

  function banner(text: string, y: number, gold: boolean): void {
    const bw = Math.min(colW() * 0.95, W() * 0.92);
    k.drawRect({
      pos: k.vec2(W() / 2, y),
      width: bw,
      height: H() * 0.09,
      anchor: 'center',
      color: gold ? GOLD : RED,
      outline: { width: 3, color: gold ? RED : GOLD },
      radius: 8,
    });
    k.drawText({
      text,
      pos: k.vec2(W() / 2, y),
      size: Math.min(H() * 0.024, bw * 0.042),
      width: bw * 0.92,
      align: 'center',
      anchor: 'center',
      color: gold ? BLACK : WHITE,
    });
  }

  function drawHud(): void {
    const size = Math.min(H() * 0.035, colW() * 0.07);
    const y = H() * 0.02;
    const shadowed = (
      text: string,
      x: number,
      anchor: 'topleft' | 'topright',
      sz = size,
      dy = 0,
    ) => {
      k.drawText({
        text,
        pos: k.vec2(x + 2, y + dy + 2),
        size: sz,
        anchor,
        color: BLACK,
        opacity: 0.5,
      });
      k.drawText({ text, pos: k.vec2(x, y + dy), size: sz, anchor, color: WHITE });
    };
    const pad = colL() + size * 0.5;
    shadowed(`${metres()} m`, pad, 'topleft');
    shadowed(
      `Best ${Math.max(best, metres())} m`,
      colL() + colW() - size * 0.5,
      'topright',
      size * 0.7,
    );
    if (stomped) shadowed(`Porters stomped ${stomped}`, pad, 'topleft', size * 0.6, size * 1.3);

    if (msgT > 0 && state === 'play') banner(msg, H() * 0.16, msgGold);

    let lines: string[] = [];
    if (state === 'ready') lines = [data.subtitle, data.intro];
    else if (state === 'dead') {
      lines = [deathLine, `${metres()} m   Best ${best} m`, deadT > 0.7 ? data.restart : ''];
    }
    if (!lines.length) return;
    const bw = Math.min(colW() * 0.95, W() * 0.92);
    const cy = H() * 0.5;
    k.drawRect({
      pos: k.vec2(W() / 2, cy),
      width: bw,
      height: H() * (0.12 + 0.07 * (lines.length - 1)),
      anchor: 'center',
      color: k.rgb(20, 20, 30),
      opacity: 0.8,
      radius: 10,
    });
    lines.forEach((text, i) => {
      k.drawText({
        text,
        pos: k.vec2(W() / 2, cy + H() * (i - (lines.length - 1) / 2) * 0.07),
        size: Math.min(H() * (i === 0 ? 0.03 : 0.024), bw * (i === 0 ? 0.048 : 0.04)),
        width: bw * 0.92,
        align: 'center',
        anchor: 'center',
        color: i === 0 ? GOLD : WHITE,
      });
    });
  }

  k.onDraw(() => {
    drawBackground();
    drawTower();
    drawGround();
    for (const p of platforms) drawPlatform(p);
    for (const q of porters) drawPorter(q);
    drawPlayer();
    for (const q of porters) drawBubble(q);
    // Dim everything outside the play column.
    if (colL() > 0) {
      for (const x of [0, colL() + colW()]) {
        k.drawRect({
          pos: k.vec2(x, 0),
          width: colL(),
          height: H(),
          color: k.rgb(12, 14, 24),
          opacity: 0.88,
        });
      }
    }
    drawHud();
  });

  reset();

  return () => {
    removeEventListener('deviceorientation', onTilt);
    canvas?.removeEventListener('pointerdown', askTilt);
  };
}
