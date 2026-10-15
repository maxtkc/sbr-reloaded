// QWOP to St John's: walk a ragdoll Johnian from Cambridge station to the Great Gate with Q, W, O and P.
import type MatterNS from 'matter-js';
import { startMatter, type MatterWorld } from '../../chaos/shared/matter';
import { beep, blip, boom, fanfare } from '../../chaos/shared/sfx';
import { createRunner, type Keys, type PartName, type Runner } from './body';
import data from './data.json';

interface RosterEntry {
  name: string;
  face: string;
}

interface Point {
  x: number;
  y: number;
}

type State = 'ready' | 'play' | 'fallen' | 'won';

const STEP = 1000 / 60;
// Runner height in cm, used to scale the view.
const RUNNER_CM = 185;
// Route metres per metre walked.
const SCALE = data.scale;
// World x (cm) of the Great Gate.
const END_CM = (data.end / SCALE) * 100;
// Building slots along the street, in cm.
const SLOT = 900;
const SCARF_LINKS = 7;
const SCARF_LINK = 9;

const RED = '#a3162b';
const RED_DARK = '#7a0f1f';
const GOLD = '#d1b948';
const NAVY = '#1f2a44';
const NAVY_DARK = '#151d31';
const SKIN = '#e9c3a0';
const INK = '#1d1a17';
const CREAM = '#f4efe4';

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
    return Number(localStorage.getItem('qwop-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('qwop-best', String(n));
  } catch {
    // Storage unavailable.
  }
}

// Deterministic 0..1 noise for building slot i.
function hash(i: number, salt = 0): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Route metres for a world x in cm.
const routeM = (x: number) => Math.max(0, (x / 100) * SCALE);

function streetAt(m: number) {
  let street = data.route[0];
  for (const r of data.route) if (m >= r.from) street = r;
  return street;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
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
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  engine.constraintIterations = 4;

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const walker = pick(readRoster().filter((m) => m.face));
  let face: HTMLImageElement | undefined;
  if (walker) {
    face = new Image();
    face.src = walker.face;
  }

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  root.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let W = 0;
  let H = 0;
  function resize(): void {
    const dpr = devicePixelRatio || 1;
    W = root.clientWidth;
    H = root.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  // Pavement from just behind the station to well past the Great Gate.
  const ground = Matter.Bodies.rectangle(END_CM / 2, 100, END_CM + 6000, 200, {
    isStatic: true,
    friction: 1,
  });
  Matter.Composite.add(engine.world, ground);

  const keys: Keys = { q: false, w: false, o: false, p: false };
  let runner: Runner;
  let state: State = 'ready';
  let stateT = 0;
  let time = 0;
  let acc = 0;
  let camX = 0;
  let best = loadBest();
  let line = '';
  let fact = '';
  let factT = 0;
  let nextLandmark = 0;
  let street = data.route[0].street;
  let lastStep = 0;
  let scarf: Point[] = [];
  let scarfPrev: Point[] = [];

  // Top of the torso, just inside its edge.
  function neck(): Point {
    const t = runner.parts.torso;
    const v = t.vertices;
    const len = Math.hypot(v[0].x - v[3].x, v[0].y - v[3].y) / 2 - 6;
    return { x: t.position.x + Math.sin(t.angle) * len, y: t.position.y - Math.cos(t.angle) * len };
  }

  function reset(): void {
    if (runner) runner.remove();
    runner = createRunner(Matter, engine, 0);
    for (const k of Object.keys(keys) as (keyof Keys)[]) keys[k] = false;
    state = 'ready';
    stateT = 0;
    time = 0;
    camX = 0;
    nextLandmark = 1;
    street = data.route[0].street;
    factT = 0;
    const n = neck();
    scarf = Array.from({ length: SCARF_LINKS }, (_, i) => ({
      x: n.x - i * SCARF_LINK,
      y: n.y + i * 2,
    }));
    scarfPrev = scarf.map((p) => ({ ...p }));
  }

  function showFact(text: string): void {
    fact = text;
    factT = 6;
  }

  function fall(): void {
    if (state !== 'play') return;
    state = 'fallen';
    stateT = 0;
    const m = routeM(runner.parts.torso.position.x);
    line = pick(data.falls).replace('{street}', street);
    showFact(pick(data.facts));
    boom();
    if (m > best) {
      best = m;
      saveBest(Math.round(m));
    }
  }

  function win(): void {
    state = 'won';
    stateT = 0;
    line = pick(data.wins);
    fanfare();
    best = Math.max(best, data.end);
    saveBest(data.end);
  }

  Matter.Events.on(engine, 'collisionStart', (e: MatterNS.IEventCollision<MatterNS.Engine>) => {
    for (const pair of e.pairs) {
      const other = pair.bodyA === ground ? pair.bodyB : pair.bodyB === ground ? pair.bodyA : null;
      if (!other) continue;
      if (runner.fatal.has(other)) fall();
      else if (
        state === 'play' &&
        (other === runner.parts['foot-l'] || other === runner.parts['foot-r']) &&
        time - lastStep > 0.15
      ) {
        lastStep = time;
        beep(90 + Math.random() * 30, 40, 'triangle', 0.05);
      }
    }
  });

  // Fixed physics step; scarf follows the neck as a chain of points with drag and gravity.
  function step(): void {
    runner.drive(keys, state === 'fallen');
    Matter.Engine.update(engine, STEP);
    const n = neck();
    scarf[0] = n;
    for (let i = 1; i < scarf.length; i++) {
      const p = scarf[i];
      const q = scarfPrev[i];
      const vx = (p.x - q.x) * 0.9;
      const vy = (p.y - q.y) * 0.9;
      scarfPrev[i] = { ...p };
      p.x += vx - 0.6;
      p.y += vy + 0.5;
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < scarf.length; i++) {
        const a = scarf[i - 1];
        const b = scarf[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const f = (d - SCARF_LINK) / d;
        b.x -= (b.x - a.x) * f;
        b.y -= (b.y - a.y) * f;
        b.y = Math.min(b.y, -1);
      }
    }
  }

  function update(dt: number): void {
    stateT += dt;
    factT -= dt;
    if (state === 'ready') return;
    if (state === 'play') time += dt;
    acc += dt * 1000 * slow;
    let n = 0;
    while (acc >= STEP && n++ < 4) {
      step();
      acc -= STEP;
    }
    if (acc > STEP) acc = 0;
    const x = runner.parts.torso.position.x;
    camX += (x - camX) * Math.min(1, dt * 4);
    if (state !== 'play') return;
    const m = routeM(x);
    const s = streetAt(m).street;
    if (s !== street) {
      street = s;
      blip();
    }
    while (nextLandmark < data.landmarks.length && m >= data.landmarks[nextLandmark].at) {
      const l = data.landmarks[nextLandmark++];
      if (nextLandmark < data.landmarks.length) {
        showFact(l.fact);
        beep(660, 80, 'square', 0.06);
      }
    }
    if (m >= data.end) {
      showFact(data.landmarks[data.landmarks.length - 1].fact);
      win();
    }
  }

  // ---- Drawing ----

  const k = () => (H * 0.28) / RUNNER_CM;
  const groundY = () => H * 0.76;
  const sx = (x: number) => W * 0.38 + (x - camX) * k();
  const sy = (y: number) => groundY() + y * k();

  function drawBackdrop(): void {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY());
    sky.addColorStop(0, '#9cc3e4');
    sky.addColorStop(1, '#dfe9f0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY());

    // Buildings in slots along the street, coloured by the street they stand on.
    const left = camX - (W * 0.38) / k();
    const right = camX + (W * 0.62) / k();
    for (let i = Math.floor(left / SLOT) - 1; i <= Math.ceil(right / SLOT); i++) {
      const x0 = i * SLOT;
      const colors = streetAt(routeM(x0 + SLOT / 2)).colors;
      const w = SLOT * (0.78 + hash(i) * 0.2);
      const h = 380 + hash(i, 1) * 520;
      const bx = sx(x0);
      const bw = w * k();
      const top = sy(-h - 60);
      const bottom = sy(-60);
      ctx.fillStyle = colors[Math.floor(hash(i, 2) * colors.length)];
      ctx.fillRect(bx, top, bw, bottom - top);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(bx, top, bw, 6 * k());
      // Windows on the upper floors, a shopfront at street level.
      const floors = Math.max(1, Math.floor((h - 260) / 180));
      const cols = Math.max(2, Math.floor(w / 220));
      ctx.fillStyle = 'rgba(40,60,90,0.55)';
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const wx = bx + ((c + 0.5) / cols) * bw - 30 * k();
          const wy = top + (60 + f * 180) * k();
          ctx.fillRect(wx, wy, 60 * k(), 100 * k());
        }
      }
      ctx.fillStyle = 'rgba(30,30,40,0.35)';
      ctx.fillRect(bx + bw * 0.1, sy(-250), bw * 0.55, 190 * k());
      ctx.fillStyle = 'rgba(30,20,10,0.6)';
      ctx.fillRect(bx + bw * 0.75, sy(-240), bw * 0.12, 180 * k());
    }

    // Back pavement strip, kerb, then road.
    ctx.fillStyle = '#b9b5ad';
    ctx.fillRect(0, sy(-60), W, groundY() - sy(-60));
    ctx.fillStyle = '#cfcbc3';
    ctx.fillRect(0, groundY(), W, H * 0.06);
    ctx.fillStyle = '#8f8a82';
    ctx.fillRect(0, groundY() + H * 0.06, W, H * 0.012);
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(0, groundY() + H * 0.072, W, H);
    ctx.fillStyle = '#e8e4da';
    const dash = 300 * k();
    const off = ((sx(0) % (dash * 2)) + dash * 2) % (dash * 2);
    for (let x = off - dash * 2; x < W; x += dash * 2) {
      ctx.fillRect(x, groundY() + H * 0.15, dash, H * 0.012);
    }

    // Paving slab joints and a metre tick with the route distance every 5 m walked.
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let m = Math.floor(left / 100); m <= Math.ceil(right / 100); m++) {
      const x = sx(m * 100);
      ctx.beginPath();
      ctx.moveTo(x, groundY());
      ctx.lineTo(x - H * 0.02, groundY() + H * 0.06);
      ctx.stroke();
      if (m >= 0 && m % 5 === 0) {
        ctx.fillStyle = 'rgba(29,26,23,0.6)';
        ctx.font = `600 ${Math.round(H * 0.022)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${m * SCALE} m`, x - H * 0.01, groundY() + H * 0.045);
      }
    }
  }

  function drawPost(x: number, label: string, street: boolean): void {
    const px = sx(x);
    if (px < -200 || px > W + 200) return;
    const postTop = sy(street ? -260 : -230);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(px - 3 * k(), postTop, 6 * k(), groundY() - postTop);
    const size = Math.max(11, Math.round(H * 0.024));
    ctx.font = street ? `700 ${size}px system-ui, sans-serif` : `600 ${size}px Georgia, serif`;
    const text = street ? label.toUpperCase() : label;
    const w = ctx.measureText(text).width + size;
    const h = size * 1.7;
    ctx.fillStyle = street ? '#ffffff' : CREAM;
    ctx.strokeStyle = street ? INK : RED;
    ctx.lineWidth = 2;
    ctx.fillRect(px - w / 2, postTop - h, w, h);
    ctx.strokeRect(px - w / 2, postTop - h, w, h);
    ctx.fillStyle = street ? INK : RED_DARK;
    ctx.textAlign = 'center';
    ctx.fillText(text, px, postTop - h * 0.3);
  }

  // The Great Gate: brick gatehouse with four turrets, the arms panel and an open arch.
  function drawGate(): void {
    const x = END_CM + 120;
    if (sx(x) > W + 50 || sx(x + 760) < -50) return;
    const brick = '#a65a37';
    ctx.fillStyle = brick;
    ctx.fillRect(sx(x), sy(-820), 760 * k(), 820 * k());
    for (const t of [0, 640]) {
      ctx.fillRect(sx(x + t - 20), sy(-1050), 140 * k(), 1050 * k());
      ctx.fillStyle = '#d9c79c';
      for (let c = 0; c < 3; c++)
        ctx.fillRect(sx(x + t - 20 + c * 55), sy(-1090), 30 * k(), 40 * k());
      ctx.fillStyle = brick;
    }
    ctx.fillStyle = '#d9c79c';
    ctx.fillRect(sx(x + 120), sy(-560), 520 * k(), 40 * k());
    ctx.fillStyle = GOLD;
    ctx.fillRect(sx(x + 290), sy(-760), 180 * k(), 180 * k());
    ctx.fillStyle = RED;
    ctx.fillRect(sx(x + 320), sy(-730), 120 * k(), 120 * k());
    ctx.fillStyle = '#2a2018';
    ctx.beginPath();
    ctx.moveTo(sx(x + 250), sy(0));
    ctx.lineTo(sx(x + 250), sy(-330));
    ctx.arc(sx(x + 380), sy(-330), 130 * k(), Math.PI, 0);
    ctx.lineTo(sx(x + 510), sy(0));
    ctx.fill();
  }

  function drawSigns(): void {
    drawGate();
    for (const r of data.route) drawPost((r.from / SCALE) * 100 + 60, r.street, true);
    for (const l of data.landmarks) drawPost((l.at / SCALE) * 100 + 220, l.name, false);
  }

  // A limb as a rounded bar between the two short edges of its rectangle; returns [top, bottom].
  function bar(name: PartName, color: string, widen = 1): Point[] {
    const v = runner.parts[name].vertices;
    const a = { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 };
    const b = { x: (v[2].x + v[3].x) / 2, y: (v[2].y + v[3].y) / 2 };
    const w = Math.hypot(v[1].x - v[0].x, v[1].y - v[0].y) * widen;
    ctx.strokeStyle = color;
    ctx.lineWidth = w * k();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx(a.x), sy(a.y));
    ctx.lineTo(sx(b.x), sy(b.y));
    ctx.stroke();
    return [a, b];
  }

  function drawFoot(name: PartName, color: string): void {
    const v = runner.parts[name].vertices;
    ctx.fillStyle = color;
    ctx.beginPath();
    v.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
    ctx.closePath();
    ctx.fill();
  }

  function drawArm(s: 'l' | 'r', back: boolean): void {
    bar(`upper-${s}`, back ? RED_DARK : RED, 1.1);
    const [, hand] = bar(`lower-${s}`, back ? RED_DARK : RED, 1.05);
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(sx(hand.x), sy(hand.y), 5.5 * k(), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLeg(s: 'l' | 'r', back: boolean): void {
    bar(`thigh-${s}`, back ? NAVY_DARK : NAVY, 1.05);
    bar(`calf-${s}`, back ? NAVY_DARK : NAVY, 1.05);
    drawFoot(`foot-${s}`, back ? '#0b0b0b' : '#1b1b1b');
  }

  function drawScarf(): void {
    ctx.lineCap = 'round';
    ctx.lineWidth = 8 * k();
    for (let i = 1; i < scarf.length; i++) {
      ctx.strokeStyle = i % 2 ? RED : '#f2f2f2';
      ctx.beginPath();
      ctx.moveTo(sx(scarf[i - 1].x), sy(scarf[i - 1].y));
      ctx.lineTo(sx(scarf[i].x), sy(scarf[i].y));
      ctx.stroke();
    }
  }

  function drawRunner(): void {
    drawArm('r', true);
    drawLeg('r', true);
    drawScarf();
    const t = runner.parts.torso;
    const [top] = bar('torso', RED, 1);
    // Shirt collar, gold buttons and the scarf knot.
    const ux = Math.sin(t.angle);
    const uy = -Math.cos(t.angle);
    ctx.fillStyle = '#f7f4ee';
    ctx.beginPath();
    ctx.arc(sx(top.x), sy(top.y), 7 * k(), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GOLD;
    for (const d of [10, 24, 38]) {
      const bx = t.position.x + ux * (22 - d) + Math.cos(t.angle) * 9;
      const by = t.position.y + uy * (22 - d) + Math.sin(t.angle) * 9;
      ctx.beginPath();
      ctx.arc(sx(bx), sy(by), 2.2 * k(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(sx(scarf[0].x), sy(scarf[0].y), 6 * k(), 0, Math.PI * 2);
    ctx.fill();

    const head = runner.parts.head;
    const r = 15 * k();
    const hx = sx(head.position.x);
    const hy = sy(head.position.y);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(head.angle);
    if (face?.complete && face.naturalWidth) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(face, -r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
    } else {
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a22';
      ctx.beginPath();
      ctx.arc(0, -r * 0.2, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(r * 0.35, r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.arc(r * 0.75, r * 0.1, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    drawLeg('l', false);
    drawArm('l', false);
  }

  function text(
    str: string,
    x: number,
    y: number,
    size: number,
    color: string,
    weight = 600,
    align: CanvasTextAlign = 'left',
    serif = false,
  ): void {
    ctx.font = `${weight} ${Math.round(size)}px ${serif ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }

  function drawHud(): void {
    const s = Math.max(12, H * 0.028);
    const m = routeM(runner.parts.torso.position.x);
    ctx.fillStyle = 'rgba(20,20,30,0.72)';
    ctx.fillRect(12, 12, Math.max(230, s * 13), s * 5.4);
    text(
      `${Math.round(m).toLocaleString('en-GB')} m`,
      24,
      12 + s * 1.9,
      s * 1.8,
      CREAM,
      700,
      'left',
      true,
    );
    text(
      `of ${data.end.toLocaleString('en-GB')} m to the Great Gate`,
      24,
      12 + s * 3.1,
      s * 0.75,
      '#c8c2b4',
      500,
    );
    text(street, 24, 12 + s * 4.3, s * 0.9, GOLD, 700);
    text(fmtTime(time), W - 24, 12 + s * 1.6, s * 1.3, INK, 700, 'right');
    text(
      `Best ${Math.round(best).toLocaleString('en-GB')} m`,
      W - 24,
      12 + s * 2.8,
      s * 0.8,
      INK,
      600,
      'right',
    );

    // Key caps, lit while held.
    const cap = Math.max(34, H * 0.065);
    const gap = cap * 0.25;
    const total = cap * 4 + gap * 3;
    const y = H - cap - 14;
    (['q', 'w', 'o', 'p'] as const).forEach((key, i) => {
      const x = W / 2 - total / 2 + i * (cap + gap) + (i > 1 ? gap * 2 : 0);
      ctx.fillStyle = keys[key] ? GOLD : 'rgba(244,239,228,0.85)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, cap, cap);
      ctx.strokeRect(x, y, cap, cap);
      text(key.toUpperCase(), x + cap / 2, y + cap * 0.68, cap * 0.5, INK, 800, 'center');
    });
    text('thighs', W / 2 - total / 2 + cap + gap / 2, y - 6, s * 0.7, CREAM, 600, 'center');
    text('knees', W / 2 + total / 2 - cap - gap / 2 + gap, y - 6, s * 0.7, CREAM, 600, 'center');

    if (factT > 0 && state === 'play') banner(fact, H * 0.04 + s * 6);
  }

  function banner(str: string, y: number): void {
    const s = Math.max(13, H * 0.026);
    ctx.font = `600 ${Math.round(s)}px system-ui, sans-serif`;
    const lines = wrapText(ctx, str, Math.min(W * 0.8, 640));
    const w = Math.min(W * 0.86, 680);
    const h = lines.length * s * 1.35 + s;
    ctx.globalAlpha = Math.min(1, factT * 2);
    ctx.fillStyle = RED_DARK;
    ctx.fillRect(W / 2 - w / 2, y, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.strokeRect(W / 2 - w / 2, y, w, h);
    lines.forEach((l, i) => text(l, W / 2, y + s * 1.35 * (i + 1), s, '#fff', 600, 'center'));
    ctx.globalAlpha = 1;
  }

  function card(
    lines: { text: string; size: number; color: string; serif?: boolean; weight?: number }[],
  ): void {
    const unit = Math.max(13, H * 0.026);
    const w = Math.min(W * 0.88, 640);
    const laid: { text: string; size: number; color: string; serif?: boolean; weight?: number }[] =
      [];
    for (const l of lines) {
      ctx.font = `${l.weight ?? 600} ${Math.round(unit * l.size)}px ${l.serif ? 'Georgia, serif' : 'system-ui, sans-serif'}`;
      for (const t of wrapText(ctx, l.text, w - unit * 2)) laid.push({ ...l, text: t });
    }
    const h = laid.reduce((a, l) => a + unit * l.size * 1.4, 0) + unit * 1.6;
    const x = W / 2 - w / 2;
    let y = Math.max(12, H * 0.38 - h / 2);
    ctx.fillStyle = 'rgba(20,20,30,0.86)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    y += unit * 0.8;
    for (const l of laid) {
      y += unit * l.size * 1.4;
      text(
        l.text,
        W / 2,
        y - unit * l.size * 0.35,
        unit * l.size,
        l.color,
        l.weight ?? 600,
        'center',
        l.serif,
      );
    }
  }

  function draw(): void {
    drawBackdrop();
    drawSigns();
    drawRunner();
    drawHud();
    const m = Math.round(routeM(runner.parts.torso.position.x));
    if (state === 'ready') {
      card([
        { text: data.title, size: 1.6, color: GOLD, serif: true, weight: 700 },
        { text: data.subtitle, size: 0.9, color: CREAM },
        { text: data.controls, size: 0.9, color: CREAM },
        { text: data.start, size: 1, color: GOLD, weight: 700 },
      ]);
    } else if (state === 'fallen' && stateT > 0.6) {
      card([
        {
          text: `${m.toLocaleString('en-GB')} m`,
          size: 1.8,
          color: GOLD,
          serif: true,
          weight: 700,
        },
        { text: line, size: 1, color: CREAM },
        { text: fact, size: 0.85, color: '#c8c2b4' },
        {
          text: `Best: ${Math.round(best).toLocaleString('en-GB')} m. Time: ${fmtTime(time)}`,
          size: 0.85,
          color: CREAM,
        },
        { text: data.restart, size: 0.95, color: GOLD, weight: 700 },
      ]);
    } else if (state === 'won' && stateT > 0.6) {
      card([
        { text: 'The Great Gate!', size: 1.8, color: GOLD, serif: true, weight: 700 },
        { text: line, size: 1, color: CREAM },
        {
          text: `Time: ${fmtTime(time)}. The Freshers' Guide says about 40 minutes.`,
          size: 0.9,
          color: CREAM,
        },
        { text: fact, size: 0.85, color: '#c8c2b4' },
        { text: data.restart, size: 0.95, color: GOLD, weight: 700 },
      ]);
    }
  }

  // ---- Loop and input ----

  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  const KEY_CODES: Record<string, keyof Keys> = { KeyQ: 'q', KeyW: 'w', KeyO: 'o', KeyP: 'p' };

  function restart(): boolean {
    if ((state !== 'fallen' && state !== 'won') || stateT < 0.6) return false;
    reset();
    blip();
    return true;
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const key = KEY_CODES[e.code];
    if (key) {
      e.preventDefault();
      keys[key] = true;
      if (state === 'ready') {
        state = 'play';
        stateT = 0;
        last = performance.now();
      }
    } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') {
      e.preventDefault();
      restart();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const key = KEY_CODES[e.code];
    if (key) keys[key] = false;
  };
  const onBlur = () => {
    for (const key of Object.keys(keys) as (keyof Keys)[]) keys[key] = false;
  };
  const onPointer = () => void restart();

  reset();
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointer);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('keydown', onKeyDown);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onPointer);
    canvas.remove();
    world.stop();
  };
}
