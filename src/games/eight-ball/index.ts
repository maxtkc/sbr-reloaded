// Impossible 8-Ball: top-down Matter.js pool where committee faces pop up and block every pocket.
import type MatterNS from 'matter-js';
import { startMatter, type MatterWorld } from '../../chaos/shared/matter';
import { beep, blip } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  name: string;
  role: string;
  face: string;
}

interface Point {
  x: number;
  y: number;
}

interface Pocket {
  x: number;
  y: number;
  // Hole radius and blocker radius, in table units.
  hole: number;
  guard: number;
}

interface Guardian {
  member: RosterEntry;
  img?: HTMLImageElement;
  body: MatterNS.Body;
  quip: string;
  // Seconds since it popped up, and since a ball was last near.
  t: number;
  idle: number;
  sinking: number;
}

interface Stats {
  shots: number;
  blocks: number;
}

type State = 'ready' | 'play';

const STEP = 1000 / 60;
// Playfield in table units (a 7ft pub table is about 2:1), and the rail around it.
const L = 1000;
const WD = 500;
const RAIL = 52;
const R = 13;
const CUSHION = 40;
// Distance from a corner and from the middle where the cushions stop.
const CORNER_GAP = 36;
const MIDDLE_GAP = 28;
// Shot speed at full power, in units per 1/60 s.
const MAX_SPEED = 30;
const STILL = 0.08;
// Rolling resistance, in units per 1/60 s per 1/60 s.
const ROLL = 0.02;
const SPOT = { x: L * 0.73, y: WD / 2 };
const AUTO_RERACK = 25;
const HUD = 40;

const RED = '#a3162b';
const GOLD = '#d1b948';
const NAVY = '#1f2a44';
const INK = '#1d1a17';
const CREAM = '#f4efe4';
const BAIZE = '#1d6b47';
const BAIZE_DARK = '#165238';
const WOOD = '#5a3720';
const WOOD_DARK = '#3e2414';

const POCKETS: Pocket[] = [
  { x: -8, y: -8, hole: 25, guard: 40 },
  { x: L / 2, y: -14, hole: 23, guard: 36 },
  { x: L + 8, y: -8, hole: 25, guard: 40 },
  { x: -8, y: WD + 8, hole: 25, guard: 40 },
  { x: L / 2, y: WD + 14, hole: 23, guard: 36 },
  { x: L + 8, y: WD + 8, hole: 25, guard: 40 },
];

const QUIPS = data.quips as Record<string, string[]>;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function readRoster(): RosterEntry[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

function loadStats(): Stats {
  try {
    const s = JSON.parse(localStorage.getItem('eight-ball-stats') ?? '{}');
    return { shots: Number(s.shots) || 0, blocks: Number(s.blocks) || 0 };
  } catch {
    return { shots: 0, blocks: 0 };
  }
}

function saveStats(s: Stats): void {
  try {
    localStorage.setItem('eight-ball-stats', JSON.stringify(s));
  } catch {
    // Storage unavailable.
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

export default function start(root: HTMLElement): () => void {
  let stop: (() => void) | undefined;
  let stopped = false;
  startMatter().then((world) => {
    if (stopped) return world.stop();
    stop = run(root, world);
  });
  return () => {
    stopped = true;
    stop?.();
  };
}

function run(root: HTMLElement, world: MatterWorld): () => void {
  const { Matter, engine } = world;
  // Stepped by hand at a fixed rate below.
  Matter.Runner.stop(world.runner);
  engine.gravity.y = 0;
  engine.positionIterations = 8;
  engine.velocityIterations = 8;
  // Keep restitution on slow contacts so balls do not stick to cushions.
  const resolver = Matter.Resolver as unknown as { _restingThresh: number };
  const restingThresh = resolver._restingThresh;
  resolver._restingThresh = 0.001;

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const roster = readRoster().filter((m) => m.face);
  const faces = new Map<string, HTMLImageElement>();
  for (const m of roster) {
    const img = new Image();
    img.src = m.face;
    faces.set(m.face, img);
  }

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
  root.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let view = new DOMMatrix();
  let inv = new DOMMatrix();
  let scale = 1;
  let rotated = false;
  function resize(): void {
    dpr = devicePixelRatio || 1;
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // Portrait screens get the table on its side.
    rotated = H > W * 1.1;
    const ow = L + RAIL * 2;
    const oh = WD + RAIL * 2;
    const availH = H - HUD - 70;
    scale = rotated ? Math.min((W - 16) / oh, availH / ow) : Math.min((W - 16) / ow, availH / oh);
    view = new DOMMatrix()
      .translate(W / 2, HUD + availH / 2 + 4)
      .rotate(rotated ? 90 : 0)
      .scale(scale)
      .translate(-L / 2, -WD / 2);
    inv = view.inverse();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  const toTable = (x: number, y: number): Point => {
    const p = inv.transformPoint({ x, y });
    return { x: p.x, y: p.y };
  };
  const toScreen = (x: number, y: number): Point => {
    const p = view.transformPoint({ x, y });
    return { x: p.x, y: p.y };
  };

  // Cushions between the pockets, plus an outer wall behind the pockets.
  const cushions: MatterNS.Body[] = [];
  const wall = (x1: number, y1: number, x2: number, y2: number) =>
    Matter.Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1, {
      isStatic: true,
      restitution: 0.8,
      friction: 0,
      label: 'cushion',
    });
  for (const [y1, y2] of [
    [-CUSHION, 0],
    [WD, WD + CUSHION],
  ]) {
    cushions.push(wall(CORNER_GAP, y1, L / 2 - MIDDLE_GAP, y2));
    cushions.push(wall(L / 2 + MIDDLE_GAP, y1, L - CORNER_GAP, y2));
  }
  cushions.push(wall(-CUSHION, CORNER_GAP, 0, WD - CORNER_GAP));
  cushions.push(wall(L, CORNER_GAP, L + CUSHION, WD - CORNER_GAP));
  const O = RAIL + 40;
  cushions.push(wall(-O, -O - 40, L + O, -O));
  cushions.push(wall(-O, WD + O, L + O, WD + O + 40));
  cushions.push(wall(-O - 40, -O, -O, WD + O));
  cushions.push(wall(L + O, -O, L + O + 40, WD + O));
  Matter.Composite.add(engine.world, cushions);

  interface Ball {
    body: MatterNS.Body;
    color: string;
    kind: 'cue' | 'red' | 'yellow' | 'black';
  }
  let balls: Ball[] = [];
  let cue: Ball;
  const guardians: (Guardian | null)[] = POCKETS.map(() => null);
  const sinking: { pocket: number; g: Guardian }[] = [];

  let state: State = 'ready';
  let shots = 0;
  let blocks = 0;
  const stats = loadStats();
  let aim = Math.PI;
  let power = 0;
  let moving = false;
  let fact = '';
  let factT = 0;
  let toast = '';
  let toastT = 0;
  let lastQuip = '';
  let acc = 0;
  let time = 0;
  let drag: Point | null = null;
  // Set on the break until the cue first touches the rack.
  let breaking = false;
  let charging = false;
  const keys = { left: false, right: false, fine: false };

  function makeBall(x: number, y: number, kind: Ball['kind']): Ball {
    const body = Matter.Bodies.circle(x, y, R, {
      restitution: 0.95,
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0.01,
      inertia: Infinity,
      slop: 0.01,
      label: 'ball',
    });
    const color = { cue: CREAM, red: RED, yellow: GOLD, black: '#111' }[kind];
    return { body, color, kind };
  }

  function rack(): void {
    for (const b of balls) Matter.Composite.remove(engine.world, b.body);
    for (let i = 0; i < guardians.length; i++) dropGuardian(i);
    balls = [];
    // Apex on the spot, black in the middle of the third row, one of each colour at the back corners.
    const colours: Ball['kind'][] = [];
    for (let i = 0; i < 6; i++) colours.push('red', 'yellow');
    colours.sort(() => Math.random() - 0.5);
    const back: Ball['kind'][] = Math.random() < 0.5 ? ['red', 'yellow'] : ['yellow', 'red'];
    const dx = R * Math.sqrt(3) + 0.6;
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i <= row; i++) {
        const x = SPOT.x + row * dx;
        const y = SPOT.y + (i - row / 2) * (R * 2 + 0.6);
        let kind: Ball['kind'];
        if (row === 2 && i === 1) kind = 'black';
        else if (row === 4 && i === 0) kind = back[0];
        else if (row === 4 && i === 4) kind = back[1];
        else kind = colours.pop()!;
        balls.push(makeBall(x, y, kind));
      }
    }
    cue = makeBall(L * 0.2, WD / 2 + (Math.random() - 0.5) * 60, 'cue');
    balls.push(cue);
    Matter.Composite.add(
      engine.world,
      balls.map((b) => b.body),
    );
    shots = 0;
    blocks = 0;
    aim = Math.atan2(SPOT.y - cue.body.position.y, SPOT.x - cue.body.position.x);
    power = 0;
    moving = false;
    breaking = true;
  }

  function showFact(): void {
    let f = pick(data.facts);
    if (f === fact) f = pick(data.facts);
    fact = f;
    factT = 7;
  }

  function showToast(text: string): void {
    toast = text;
    toastT = 2.5;
  }

  function quipFor(member: RosterEntry): string {
    const list = QUIPS[member.role] ?? QUIPS.default;
    let q = pick(list);
    if (q === lastQuip && list.length > 1) q = pick(list.filter((x) => x !== lastQuip));
    lastQuip = q;
    return q;
  }

  function raiseGuardian(i: number): Guardian {
    const existing = guardians[i];
    if (existing) {
      existing.idle = 0;
      return existing;
    }
    const used = new Set(guardians.filter(Boolean).map((g) => g!.member.name));
    const free = roster.filter((m) => !used.has(m.name));
    const member = free.length
      ? pick(free)
      : roster.length
        ? pick(roster)
        : { name: 'The Committee', role: 'default', face: '' };
    const p = POCKETS[i];
    const body = Matter.Bodies.circle(p.x, p.y, p.guard, {
      isStatic: true,
      restitution: 1.1,
      friction: 0,
      label: 'guardian',
    });
    Matter.Composite.add(engine.world, body);
    const g: Guardian = {
      member,
      img: faces.get(member.face),
      body,
      quip: quipFor(member),
      t: 0,
      idle: 0,
      sinking: 0,
    };
    guardians[i] = g;
    blocks++;
    stats.blocks++;
    saveStats(stats);
    beep(220, 120, 'sine', 0.12);
    beep(330, 140, 'sine', 0.1, 70);
    if (blocks % 3 === 1) showFact();
    return g;
  }

  function dropGuardian(i: number): void {
    const g = guardians[i];
    if (!g) return;
    Matter.Composite.remove(engine.world, g.body);
    guardians[i] = null;
    sinking.push({ pocket: i, g });
  }

  // Pops a guardian up for any ball heading at a pocket, and returns strays that slipped past.
  function guardPockets(dt: number): void {
    const reach = Math.min(160, 95 + shots * 2.5);
    const near = POCKETS.map(() => false);
    for (const b of balls) {
      const pos = b.body.position;
      const v = b.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      POCKETS.forEach((p, i) => {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        const d = Math.hypot(dx, dy);
        const heading = speed > 0.3 && (dx * v.x + dy * v.y) / (d * speed) > 0.35;
        if (d < 60 || (heading && d < reach + speed * 6)) near[i] = true;
      });
      // Safety net: a ball past the cushion line goes back out of the nearest pocket.
      if (pos.x < 0 || pos.x > L || pos.y < 0 || pos.y > WD) {
        let best = 0;
        let bestD = Infinity;
        POCKETS.forEach((p, i) => {
          const d = Math.hypot(p.x - pos.x, p.y - pos.y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        const p = POCKETS[best];
        const nx = L / 2 - p.x;
        const ny = WD / 2 - p.y;
        const n = Math.hypot(nx, ny);
        const ux = nx / n;
        const uy = ny / n;
        Matter.Body.setPosition(b.body, {
          x: p.x + ux * (p.guard + R + 2),
          y: p.y + uy * (p.guard + R + 2),
        });
        const dot = v.x * ux + v.y * uy;
        const out = Math.max(1.5, Math.abs(dot));
        Matter.Body.setVelocity(b.body, {
          x: (v.x - dot * ux) * 0.6 + ux * out * 0.9,
          y: (v.y - dot * uy) * 0.6 + uy * out * 0.9,
        });
        raiseGuardian(best);
        near[best] = true;
        showToast(pick(data.spat));
      }
    }
    POCKETS.forEach((_, i) => {
      if (near[i]) raiseGuardian(i);
      const g = guardians[i];
      if (!g) return;
      g.t += dt;
      g.idle = near[i] ? 0 : g.idle + dt;
      if (g.idle > 1.8 && g.t > 1.5) dropGuardian(i);
    });
    for (let j = sinking.length - 1; j >= 0; j--) {
      sinking[j].g.sinking += dt;
      if (sinking[j].g.sinking > 0.3) sinking.splice(j, 1);
    }
  }

  // Matter's solver soaks up a break into a tight pack, so the rack is spread by hand on first contact.
  function spreadRack(speed: number): void {
    breaking = false;
    const cx = SPOT.x + R * 3.5;
    for (const b of balls) {
      if (b === cue) continue;
      const a =
        Math.atan2(b.body.position.y - SPOT.y, b.body.position.x - cx) + (Math.random() - 0.5);
      const s = speed * (0.12 + Math.random() * 0.25);
      Matter.Body.setVelocity(b.body, {
        x: b.body.velocity.x + Math.cos(a) * s,
        y: b.body.velocity.y + Math.sin(a) * s,
      });
    }
  }

  // Constant rolling resistance on top of frictionAir, so slow balls stop in a sensible time.
  function roll(): void {
    for (const b of balls) {
      const v = b.body.velocity;
      const s = Math.hypot(v.x, v.y);
      if (s === 0) continue;
      const k = Math.max(0, s - ROLL / 2) / s;
      Matter.Body.setVelocity(b.body, { x: v.x * k, y: v.y * k });
    }
  }

  function settle(): boolean {
    let still = true;
    for (const b of balls) {
      const v = b.body.velocity;
      if (Math.hypot(v.x, v.y) < STILL) Matter.Body.setVelocity(b.body, { x: 0, y: 0 });
      else still = false;
    }
    return still;
  }

  function shoot(): void {
    if (state !== 'play' || moving || power < 0.04) {
      power = 0;
      return;
    }
    const s = MAX_SPEED * power ** 1.2;
    Matter.Body.setVelocity(cue.body, { x: Math.cos(aim) * s, y: Math.sin(aim) * s });
    beep(180, 50, 'triangle', 0.05 + power * 0.1);
    power = 0;
    moving = true;
    shots++;
    stats.shots++;
    saveStats(stats);
  }

  Matter.Events.on(engine, 'collisionStart', (e: MatterNS.IEventCollision<MatterNS.Engine>) => {
    for (const pair of e.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (rel < 0.4) continue;
      if (
        breaking &&
        a.label === 'ball' &&
        b.label === 'ball' &&
        (a === cue.body || b === cue.body)
      )
        spreadRack(rel);
      const vol = Math.min(0.12, rel * 0.008);
      if (a.label === 'ball' && b.label === 'ball')
        beep(1300 + Math.random() * 400, 25, 'triangle', vol);
      else if (a.label === 'guardian' || b.label === 'guardian') beep(160, 90, 'sine', vol * 1.4);
      else beep(110, 50, 'sine', vol);
    }
  });

  function update(dt: number): void {
    time += dt;
    factT = Math.max(0, factT - dt);
    toastT = Math.max(0, toastT - dt);
    if (state === 'play' && !moving && !drag) {
      const turn = (keys.fine ? 0.25 : 1.4) * dt;
      if (keys.left) aim -= turn;
      if (keys.right) aim += turn;
      if (charging) power = Math.min(1, power + dt / 1.2);
    }
    acc += dt * 1000 * slow;
    while (acc >= STEP) {
      acc -= STEP;
      // Two half steps keep fast balls from passing through each other.
      for (let i = 0; i < 2; i++) {
        Matter.Engine.update(engine, STEP / 2);
        roll();
      }
      guardPockets(STEP / 1000);
    }
    if (moving && settle()) {
      moving = false;
      if (shots >= AUTO_RERACK) {
        showToast(pick(data.rerack));
        rack();
      }
    }
  }

  // First thing the aim ray meets: a ball (with the ghost ball position) or a cushion.
  function aimRay(): { end: Point; ghost?: Point } {
    const o = cue.body.position;
    const dx = Math.cos(aim);
    const dy = Math.sin(aim);
    let tMax = 350;
    let ghost: Point | undefined;
    for (const b of balls) {
      if (b === cue) continue;
      const cx = b.body.position.x - o.x;
      const cy = b.body.position.y - o.y;
      const proj = cx * dx + cy * dy;
      if (proj <= 0) continue;
      const perp2 = cx * cx + cy * cy - proj * proj;
      const r2 = (R * 2) ** 2;
      if (perp2 > r2) continue;
      const t = proj - Math.sqrt(r2 - perp2);
      if (t < tMax) {
        tMax = t;
        ghost = { x: o.x + dx * t, y: o.y + dy * t };
      }
    }
    const walls = [
      dx > 0 ? (L - R - o.x) / dx : dx < 0 ? (R - o.x) / dx : Infinity,
      dy > 0 ? (WD - R - o.y) / dy : dy < 0 ? (R - o.y) / dy : Infinity,
    ];
    const tw = Math.min(...walls);
    if (tw < tMax) {
      tMax = tw;
      ghost = undefined;
    }
    return { end: { x: o.x + dx * tMax, y: o.y + dy * tMax }, ghost };
  }

  function drawTable(): void {
    // Rail.
    ctx.fillStyle = WOOD_DARK;
    ctx.beginPath();
    ctx.roundRect(-RAIL - 6, -RAIL - 6, L + RAIL * 2 + 12, WD + RAIL * 2 + 12, 30);
    ctx.fill();
    ctx.fillStyle = WOOD;
    ctx.beginPath();
    ctx.roundRect(-RAIL, -RAIL, L + RAIL * 2, WD + RAIL * 2, 24);
    ctx.fill();
    // Cushions and bed.
    ctx.fillStyle = BAIZE_DARK;
    ctx.fillRect(-14, -14, L + 28, WD + 28);
    ctx.fillStyle = BAIZE;
    ctx.fillRect(0, 0, L, WD);
    // Baulk line, D and spot.
    ctx.strokeStyle = 'rgba(244,239,228,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L * 0.2, 0);
    ctx.lineTo(L * 0.2, WD);
    ctx.moveTo(L * 0.2, WD / 2 - WD * 0.16);
    ctx.arc(L * 0.2, WD / 2, WD * 0.16, -Math.PI / 2, Math.PI / 2, true);
    ctx.stroke();
    ctx.fillStyle = 'rgba(244,239,228,0.45)';
    ctx.beginPath();
    ctx.arc(SPOT.x, SPOT.y, 3, 0, Math.PI * 2);
    ctx.fill();
    // Diamonds.
    ctx.fillStyle = CREAM;
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      for (const y of [-RAIL / 2 - 6, WD + RAIL / 2 + 6]) {
        // The plaque takes the bottom rail's sixth diamond.
        if (i === 6 && y > 0) continue;
        ctx.beginPath();
        ctx.arc((L / 8) * i, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 1; i < 4; i++) {
      for (const x of [-RAIL / 2 - 6, L + RAIL / 2 + 6]) {
        ctx.beginPath();
        ctx.arc(x, (WD / 4) * i, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Pockets.
    for (const p of POCKETS) {
      ctx.fillStyle = '#0b0b0b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.hole, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a8a8a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // Plaque on the bottom rail.
    ctx.fillStyle = GOLD;
    ctx.font = `600 15px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SAMUEL BUTLER ROOM', L * 0.75, WD + RAIL / 2 + 6);
  }

  function drawBalls(): void {
    for (const b of balls) {
      const { x, y } = b.body.position;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(x + 3, y + 3, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
      if (b.kind === 'black') {
        ctx.fillStyle = CREAM;
        ctx.beginPath();
        ctx.arc(x, y, R * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `700 ${R * 0.8}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('8', x, y + 0.5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(x - R * 0.35, y - R * 0.35, R * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCue(): void {
    if (state !== 'play' || moving) return;
    const o = cue.body.position;
    const dx = Math.cos(aim);
    const dy = Math.sin(aim);
    // Aim line and ghost ball.
    const { end, ghost } = aimRay();
    ctx.strokeStyle = 'rgba(244,239,228,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(o.x + dx * R, o.y + dy * R);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ghost) {
      ctx.beginPath();
      ctx.arc(ghost.x, ghost.y, R, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Stick, pulled back with power.
    const back = R + 8 + power * 70;
    const len = 520;
    const sx = o.x - dx * back;
    const sy = o.y - dy * back;
    const ex = sx - dx * len;
    const ey = sy - dy * len;
    const nx = -dy;
    const ny = dx;
    ctx.fillStyle = '#c9a26b';
    ctx.beginPath();
    ctx.moveTo(sx + nx * 3, sy + ny * 3);
    ctx.lineTo(ex + nx * 7, ey + ny * 7);
    ctx.lineTo(ex - nx * 7, ey - ny * 7);
    ctx.lineTo(sx - nx * 3, sy - ny * 3);
    ctx.fill();
    ctx.strokeStyle = WOOD_DARK;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(sx - dx * 360, sy - dy * 360);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - dx * 8, sy - dy * 8);
    ctx.stroke();
    ctx.strokeStyle = '#3d6fb6';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - dx * 2, sy - dy * 2);
    ctx.stroke();
  }

  // Face in a pocket, in screen space so it stays upright on a rotated table.
  function drawGuardian(i: number, g: Guardian, sink: number): void {
    const p = POCKETS[i];
    const c = toScreen(p.x, p.y);
    const pop = sink > 0 ? 1 - sink / 0.3 : easeOutBack(Math.min(1, g.t / 0.25));
    const r = Math.max(0, p.guard * scale * 1.05 * pop);
    if (r < 1) return;
    const wob = sink > 0 ? 0 : Math.sin(time * 6 + i) * 0.06 * Math.max(0, 1 - g.t / 2);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(wob);
    ctx.fillStyle = NAVY;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    if (g.img?.complete && g.img.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(g.img, -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      // Plain silhouette.
      ctx.fillStyle = '#c8c2b4';
      ctx.beginPath();
      ctx.arc(0, -r * 0.22, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, r * 0.62, r * 0.62, r * 0.42, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBubble(i: number, g: Guardian): void {
    if (g.t > 2.6) return;
    const p = POCKETS[i];
    const c = toScreen(p.x, p.y);
    const mid = toScreen(L / 2, WD / 2);
    const fs = Math.max(12, Math.min(16, W / 50));
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const maxW = Math.min(220, W * 0.42);
    const lines = wrapText(ctx, g.quip, maxW);
    const head = `${g.member.name}${g.member.role !== 'default' ? `, ${g.member.role}` : ''}`;
    ctx.font = `600 ${fs * 0.8}px system-ui, sans-serif`;
    const w =
      Math.max(
        ctx.measureText(head).width,
        ...lines.map((l) => {
          ctx.font = `600 ${fs}px system-ui, sans-serif`;
          return ctx.measureText(l).width;
        }),
      ) + 20;
    const h = lines.length * fs * 1.3 + fs * 0.8 * 1.3 + 14;
    // Offset toward the middle of the table, kept on screen.
    const dx = mid.x - c.x;
    const dy = mid.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const off = p.guard * scale + 30;
    let bx = c.x + (dx / d) * off - w / 2;
    let by = c.y + (dy / d) * off - h / 2;
    bx = Math.max(6, Math.min(W - w - 6, bx));
    by = Math.max(HUD + 4, Math.min(H - h - 6, by));
    ctx.fillStyle = CREAM;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = RED;
    ctx.font = `600 ${fs * 0.8}px system-ui, sans-serif`;
    ctx.fillText(head, bx + 10, by + 7);
    ctx.fillStyle = INK;
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    lines.forEach((l, j) => ctx.fillText(l, bx + 10, by + 7 + fs * 0.8 * 1.3 + j * fs * 1.3));
  }

  function text(
    s: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left',
    serif = false,
    weight = 600,
  ): void {
    ctx.font = `${weight} ${Math.round(size)}px ${serif ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function drawHud(): void {
    const fs = Math.max(12, Math.min(17, W / 45));
    text(`Shots: ${shots}   Pots: 0   Blocked: ${blocks}`, 12, HUD / 2, fs, CREAM);
    if (W > 520)
      text(
        `Lifetime: ${stats.shots.toLocaleString('en-GB')} shots, 0 pots`,
        W - 12,
        HUD / 2,
        fs,
        '#c8c2b4',
        'right',
      );
    // Power bar under the table.
    if (state === 'play' && !moving && power > 0) {
      const bw = Math.min(260, W * 0.6);
      const bx = W / 2 - bw / 2;
      const by = H - 58;
      ctx.fillStyle = 'rgba(20,20,30,0.8)';
      ctx.fillRect(bx, by, bw, 12);
      ctx.fillStyle = power > 0.85 ? RED : GOLD;
      ctx.fillRect(bx, by, bw * power, 12);
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, 12);
    }
    if (factT > 0) {
      ctx.globalAlpha = Math.min(1, factT * 2);
      const ffs = Math.max(12, Math.min(16, W / 50));
      ctx.font = `600 ${ffs}px system-ui, sans-serif`;
      const lines = wrapText(ctx, fact, Math.min(W - 40, 640));
      const h = lines.length * ffs * 1.35 + 12;
      const y = H - h - 6;
      ctx.fillStyle = RED;
      ctx.fillRect(10, y, W - 20, h);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.strokeRect(10, y, W - 20, h);
      lines.forEach((l, j) =>
        text(l, W / 2, y + 6 + ffs * 0.7 + j * ffs * 1.35, ffs, CREAM, 'center'),
      );
      ctx.globalAlpha = 1;
    }
    if (toastT > 0) {
      ctx.globalAlpha = Math.min(1, toastT * 2);
      const c = toScreen(L / 2, WD / 2);
      text(toast, c.x, c.y, Math.max(16, Math.min(28, W / 30)), GOLD, 'center', true, 700);
      ctx.globalAlpha = 1;
    }
  }

  function drawReady(): void {
    const unit = Math.max(13, Math.min(H * 0.026, 20));
    const w = Math.min(W * 0.88, 600);
    const items = [
      { s: data.title, size: 1.6, color: GOLD, serif: true, weight: 700 },
      { s: data.subtitle, size: 0.9, color: CREAM, serif: false, weight: 600 },
      { s: data.controls, size: 0.9, color: CREAM, serif: false, weight: 600 },
      {
        s: `Lifetime: ${stats.shots.toLocaleString('en-GB')} shots, ${stats.blocks.toLocaleString('en-GB')} blocked, 0 pots`,
        size: 0.8,
        color: '#c8c2b4',
        serif: false,
        weight: 600,
      },
      { s: data.start, size: 1, color: GOLD, serif: false, weight: 700 },
    ];
    const laid: { s: string; size: number; color: string; serif: boolean; weight: number }[] = [];
    for (const it of items) {
      ctx.font = `${it.weight} ${Math.round(unit * it.size)}px ${it.serif ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
      for (const l of wrapText(ctx, it.s, w - unit * 2)) laid.push({ ...it, s: l });
    }
    const h = laid.reduce((a, l) => a + unit * l.size * 1.4, 0) + unit * 1.6;
    const x = W / 2 - w / 2;
    let y = Math.max(HUD + 6, H * 0.45 - h / 2);
    ctx.fillStyle = 'rgba(20,20,30,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    y += unit * 0.8;
    for (const l of laid) {
      y += unit * l.size * 1.4;
      text(
        l.s,
        W / 2,
        y - unit * l.size * 0.7,
        unit * l.size,
        l.color,
        'center',
        l.serif,
        l.weight,
      );
    }
  }

  function draw(): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14141e';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(new DOMMatrix().scale(dpr).multiply(view));
    drawTable();
    drawBalls();
    drawCue();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of sinking) drawGuardian(s.pocket, s.g, s.g.sinking || 0.001);
    guardians.forEach((g, i) => g && drawGuardian(i, g, 0));
    guardians.forEach((g, i) => g && drawBubble(i, g));
    drawHud();
    if (state === 'ready') drawReady();
  }

  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function begin(): void {
    if (state === 'ready') {
      state = 'play';
      blip();
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.fine = true;
    else if (e.code === 'Space' || e.code === 'Enter') {
      if (!e.repeat) {
        begin();
        if (!moving) {
          charging = true;
          power = 0;
        }
      }
    } else if (e.code === 'KeyR') {
      begin();
      showToast(pick(data.rerack));
      rack();
    } else return;
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.fine = false;
    else if ((e.code === 'Space' || e.code === 'Enter') && charging) {
      charging = false;
      shoot();
    }
  };
  const onBlur = () => {
    keys.left = keys.right = keys.fine = false;
    charging = false;
    drag = null;
    power = 0;
  };
  // Slingshot: pull back from wherever the drag started, release to shoot.
  const onDown = (e: PointerEvent) => {
    begin();
    if (moving) return;
    canvas.setPointerCapture(e.pointerId);
    drag = toTable(e.offsetX, e.offsetY);
    power = 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const p = toTable(e.offsetX, e.offsetY);
    const dx = drag.x - p.x;
    const dy = drag.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d * scale > 6) aim = Math.atan2(dy, dx);
    power = Math.min(1, d / 260);
  };
  const onUp = () => {
    if (!drag) return;
    drag = null;
    shoot();
  };

  rack();
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onBlur);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
    canvas.remove();
    resolver._restingThresh = restingThresh;
    world.stop();
  };
}
