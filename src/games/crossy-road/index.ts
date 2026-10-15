// Crossy Road: hop from the GSR across Cambridge traffic to the SBR in First Court.
import type { KAPLAYCtx } from 'kaplay';
import { startKaplay } from '../../chaos/shared/kaplay';
import { beep, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  slug: string;
  face: string;
}

type Kind = 'bike' | 'scooter' | 'bus';

interface Traffic {
  kind: string;
  dir: number;
  speed: number;
  gap: number[];
}

interface Row {
  type: string;
  name: string;
  tiles?: string;
  prop?: string;
  traffic?: Traffic;
}

interface Vehicle {
  x: number;
  len: number;
  kind: Kind;
  color: [number, number, number];
  label: string;
}

interface Lane {
  vehicles: Vehicle[];
  wait: number;
}

type State = 'ready' | 'play' | 'dead' | 'won';
type Death = keyof typeof data.deaths;

const COURSE = data.course as Row[];
const COLS = data.cols;
// Vehicles live between these columns, well past the visible grid on wide screens.
const LO = -14;
const HI = COLS + 14;
const LENGTHS: Record<Kind, number> = { bike: 0.6, scooter: 0.95, bus: 2.9 };
const JACKETS: [number, number, number][] = [
  [200, 60, 50],
  [60, 120, 200],
  [240, 200, 60],
  [80, 160, 90],
  [150, 90, 170],
];
const BOXES: [number, number, number][] = [
  [0, 200, 190],
  [255, 120, 0],
  [20, 170, 80],
];
const BUSES: { color: [number, number, number]; label: string }[] = [
  { color: [190, 30, 40], label: '1' },
  { color: [30, 80, 160], label: '3' },
  { color: [20, 120, 90], label: 'U' },
];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function readRoster(): RosterEntry[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('crossy-road-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('crossy-road-best', String(n));
  } catch {
    // Storage unavailable.
  }
}

function tileAt(r: number, c: number): string {
  if (r < 0 || r >= COURSE.length || c < 0 || c >= COLS) return '#';
  return COURSE[r].tiles?.[c] ?? '.';
}

export default function start(root: HTMLElement): () => void {
  let stop: (() => void) | undefined;
  let stopped = false;
  startKaplay(root, { background: [60, 60, 66], pixelDensity: devicePixelRatio }).then((ctx) => {
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
  const walker = pick(readRoster().filter((m) => m.face));
  if (walker) k.loadSprite('walker', walker.face);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const RED = k.rgb(122, 15, 31);
  const GOLD = k.rgb(209, 185, 72);
  const WHITE = k.rgb(255, 255, 255);
  const STONE = k.rgb(206, 190, 150);
  const BRICK = k.rgb(150, 70, 50);
  const startCol = COURSE[0].tiles!.indexOf('.');

  let state: State = 'ready';
  let lanes: Lane[] = [];
  let trip = 1;
  let score = 0;
  let best = loadBest();
  let furthest = 0;
  let col = startCol;
  let row = 0;
  let fromCol = col;
  let fromRow = row;
  let hopT = 1;
  let queued: [number, number] | null = null;
  let idleT = 0;
  let deathT = 0;
  let death: Death = 'bike';
  let deathLine = '';
  let wonT = 0;
  let winLine = '';
  let factIndex = Math.floor(Math.random() * data.facts.length);
  let fact = '';
  let factT = 0;
  let camR = 0;
  let time = 0;
  let downPos: { x: number; y: number } | null = null;

  // Layout, all derived from the current canvas size.
  const H = () => k.height();
  const W = () => k.width();
  const tile = () => Math.min(W() / COLS, H() / 9);
  const ox = () => (W() - COLS * tile()) / 2;
  const rowY = (r: number) => H() - (r - camR + 1) * tile();
  const colX = (c: number) => ox() + c * tile();
  const mult = () => (1 + 0.15 * (trip - 1)) * slow;

  function spawn(lane: Lane, t: Traffic): void {
    const kind = t.kind as Kind;
    const len = LENGTHS[kind];
    // Bikes come in swarms of up to four.
    const count = kind === 'bike' ? 1 + Math.floor(Math.random() * 4) : 1;
    for (let i = 0; i < count; i++) {
      const bus = pick(BUSES);
      const at = t.dir > 0 ? LO - len : HI;
      lane.vehicles.push({
        x: at - t.dir * i * 0.85,
        len,
        kind,
        color: kind === 'bus' ? bus.color : kind === 'scooter' ? pick(BOXES) : pick(JACKETS),
        label: bus.label,
      });
    }
    lane.wait = (len + (count - 1) * 0.85 + rand(t.gap[0], t.gap[1])) / t.speed;
  }

  function moveTraffic(dt: number): void {
    lanes.forEach((lane, r) => {
      const t = COURSE[r].traffic;
      if (!t) return;
      const v = t.speed * mult();
      for (const veh of lane.vehicles) veh.x += t.dir * v * dt;
      lane.vehicles = lane.vehicles.filter((veh) => veh.x > LO - 6 && veh.x < HI + 6);
      lane.wait -= dt * mult();
      if (lane.wait <= 0) spawn(lane, t);
    });
  }

  function resetTraffic(): void {
    lanes = COURSE.map(() => ({ vehicles: [], wait: 0 }));
    // Run the lanes for a while so traffic fills the street from the start.
    for (let i = 0; i < 300; i++) moveTraffic(0.1);
  }

  function placeAtStart(): void {
    col = fromCol = startCol;
    row = fromRow = 0;
    hopT = 1;
    queued = null;
    furthest = 0;
    idleT = 0;
  }

  function restart(): void {
    trip = 1;
    score = 0;
    placeAtStart();
    resetTraffic();
    state = 'ready';
  }

  function showFact(): void {
    fact = data.facts[factIndex++ % data.facts.length];
    factT = 4;
  }

  function die(cause: Death): void {
    if (state !== 'play') return;
    state = 'dead';
    death = cause;
    deathT = 0;
    deathLine = pick(data.deaths[cause]);
    queued = null;
    if (cause === 'eagle') beep(1200, 300, 'sawtooth', 0.06);
    else boom(cause === 'bus' ? 400 : 200, 0.2);
    if (score > best) {
      best = score;
      saveBest(best);
    }
  }

  function win(): void {
    state = 'won';
    wonT = 0;
    score += 10 * trip;
    winLine = pick(data.wins);
    fanfare();
    showFact();
  }

  function hop(dc: number, dr: number): void {
    if (state === 'dead') {
      if (deathT > 0.7) restart();
      return;
    }
    if (state === 'ready') state = 'play';
    if (state !== 'play') return;
    if (hopT < 1) {
      queued = [dc, dr];
      return;
    }
    const nc = col + dc;
    const nr = row + dr;
    if (tileAt(nr, nc) === '#') {
      beep(160, 40, 'square', 0.04);
      return;
    }
    fromCol = col;
    fromRow = row;
    col = nc;
    row = nr;
    hopT = 0;
    beep(dr > 0 ? 620 : 520, 35, 'triangle', 0.05);
  }

  // Called once a hop lands.
  function land(): void {
    const t = tileAt(row, col);
    if (row > furthest) {
      score += row - furthest;
      furthest = row;
      idleT = 0;
      const type = COURSE[row].type;
      if (type === 'pavement' || type === 'gate') showFact();
    }
    if (t === 'g') die('lawn');
    else if (t === 'D') win();
  }

  const tap = () => hop(0, 1);

  k.onKeyPress(['up', 'w'], () => hop(0, 1));
  k.onKeyPress(['down', 's'], () => hop(0, -1));
  k.onKeyPress(['left', 'a'], () => hop(-1, 0));
  k.onKeyPress(['right', 'd'], () => hop(1, 0));
  k.onKeyPress(['space', 'enter'], tap);
  // Tap hops forward, a swipe hops in its direction.
  k.onMousePress(() => {
    const p = k.mousePos();
    downPos = { x: p.x, y: p.y };
  });
  k.onMouseRelease(() => {
    if (!downPos) return;
    const p = k.mousePos();
    const dx = p.x - downPos.x;
    const dy = p.y - downPos.y;
    downPos = null;
    if (Math.hypot(dx, dy) < Math.max(24, tile() * 0.4)) return tap();
    if (Math.abs(dx) > Math.abs(dy)) hop(Math.sign(dx), 0);
    else hop(0, -Math.sign(dy));
  });

  resetTraffic();

  // Player centre in grid units, interpolated through the hop.
  function playerPos(): { x: number; r: number; lift: number } {
    const t = Math.min(1, hopT);
    return {
      x: fromCol + (col - fromCol) * t + 0.5,
      r: fromRow + (row - fromRow) * t,
      lift: Math.sin(Math.PI * t),
    };
  }

  function checkTraffic(): void {
    const p = playerPos();
    const r = Math.round(p.r);
    const t = COURSE[r]?.traffic;
    if (!t) return;
    for (const v of lanes[r].vehicles) {
      if (p.x + 0.28 > v.x && p.x - 0.28 < v.x + v.len) return die(v.kind);
    }
  }

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 1 / 30);
    time += dt;
    factT -= dt;
    moveTraffic(dt);

    if (hopT < 1) {
      hopT = Math.min(1, hopT + dt / (0.12 / slow));
      if (hopT >= 1) {
        land();
        if (queued && state === 'play') {
          const [dc, dr] = queued;
          queued = null;
          hop(dc, dr);
        }
      }
    }

    if (state === 'play') {
      checkTraffic();
      idleT += dt * slow;
      if (idleT > data.eagleTime) die('eagle');
    } else if (state === 'dead') {
      deathT += dt;
    } else if (state === 'won') {
      wonT += dt;
      if (wonT > 3) {
        trip++;
        placeAtStart();
        state = 'play';
      }
    }

    // Camera keeps the player in the lower third.
    const visible = H() / tile();
    const target = Math.max(0, Math.min(COURSE.length - visible + 0.5, playerPos().r - 2));
    camR += (target - camR) * Math.min(1, dt * 8);
  });

  function drawTiles(r: number, y: number, t: number): void {
    const row = COURSE[r];
    for (let c = 0; c < COLS; c++) {
      const ch = row.tiles?.[c] ?? '.';
      const x = colX(c);
      if (ch === 'g') {
        k.drawRect({
          pos: k.vec2(x, y),
          width: t,
          height: t,
          color: c % 2 ? k.rgb(96, 160, 80) : k.rgb(110, 175, 90),
        });
      } else if (ch === 'D') {
        k.drawRect({ pos: k.vec2(x, y), width: t, height: t, color: k.rgb(90, 60, 40) });
        k.drawRect({
          pos: k.vec2(x + t * 0.1, y + t * 0.1),
          width: t * 0.8,
          height: t * 0.8,
          color: k.rgb(130, 90, 55),
          radius: [t * 0.4, t * 0.4, 0, 0],
        });
        k.drawText({
          text: 'I',
          pos: k.vec2(x + t / 2, y + t * 0.45),
          size: t * 0.4,
          anchor: 'center',
          color: GOLD,
        });
      } else if (ch === '#') drawProp(row, x, y, t, c, r);
    }
  }

  function drawProp(row: Row, x: number, y: number, t: number, c: number, r: number): void {
    const cx = x + t / 2;
    const cy = y + t / 2;
    switch (row.type) {
      case 'building':
      case 'gate':
      case 'goal': {
        const wall = row.type === 'gate' ? BRICK : STONE;
        k.drawRect({ pos: k.vec2(x, y), width: t, height: t, color: wall });
        k.drawLine({
          p1: k.vec2(x, y + t / 2),
          p2: k.vec2(x + t, y + t / 2),
          width: 1,
          color: k.rgb(0, 0, 0),
          opacity: 0.2,
        });
        if (row.type === 'gate' && (c === 3 || c === 7)) {
          // Turrets either side of the gate opening.
          k.drawRect({
            pos: k.vec2(x + t * 0.1, y - t * 0.2),
            width: t * 0.8,
            height: t * 1.2,
            color: k.rgb(130, 60, 42),
            outline: { width: 2, color: k.rgb(90, 40, 30) },
          });
        }
        break;
      }
      case 'pavement': {
        if (row.prop === 'bollard') {
          k.drawCircle({ pos: k.vec2(cx, cy), radius: t * 0.18, color: k.rgb(40, 40, 46) });
          k.drawCircle({ pos: k.vec2(cx, cy), radius: t * 0.08, color: GOLD });
        } else if (row.prop === 'stall') {
          k.drawRect({
            pos: k.vec2(x + t * 0.05, y + t * 0.15),
            width: t * 0.9,
            height: t * 0.7,
            color: (c + r) % 2 ? k.rgb(200, 60, 60) : WHITE,
            outline: { width: 2, color: k.rgb(120, 40, 40) },
          });
          k.drawRect({
            pos: k.vec2(x + t * 0.05, y + t * 0.15),
            width: t * 0.9,
            height: t * 0.2,
            color: (c + r) % 2 ? WHITE : k.rgb(200, 60, 60),
          });
        } else if (row.prop === 'bin') {
          k.drawRect({
            pos: k.vec2(cx, cy),
            width: t * 0.5,
            height: t * 0.5,
            anchor: 'center',
            color: k.rgb(40, 90, 50),
            radius: t * 0.05,
          });
        } else {
          // A tourist taking a photo, slowly turning round.
          const a = time * 0.8 + c;
          k.drawCircle({
            pos: k.vec2(cx, cy),
            radius: t * 0.26,
            color: k.rgb(...JACKETS[(c + r) % JACKETS.length]),
          });
          k.drawCircle({ pos: k.vec2(cx, cy), radius: t * 0.14, color: k.rgb(235, 200, 170) });
          k.drawRect({
            pos: k.vec2(cx + Math.cos(a) * t * 0.22, cy + Math.sin(a) * t * 0.22),
            width: t * 0.16,
            height: t * 0.11,
            anchor: 'center',
            color: k.rgb(30, 30, 30),
          });
        }
        break;
      }
    }
  }

  function drawRow(r: number): void {
    const t = tile();
    const y = rowY(r);
    if (y > H() || y + t < 0) return;
    const row = COURSE[r];
    const ground: Record<string, [number, number, number]> = {
      building: [150, 140, 125],
      pavement: [196, 192, 184],
      road: [70, 70, 76],
      cycle: [160, 70, 62],
      gate: [180, 170, 150],
      court: [205, 190, 160],
      goal: [205, 190, 160],
    };
    k.drawRect({ pos: k.vec2(0, y), width: W(), height: t, color: k.rgb(...ground[row.type]) });
    if (row.type === 'pavement') {
      for (let x = ox() % t; x < W(); x += t) {
        k.drawLine({
          p1: k.vec2(x, y),
          p2: k.vec2(x, y + t),
          width: 1,
          color: k.rgb(160, 156, 150),
        });
      }
    }
    // Dashed centre line between two lanes of the same street.
    if (row.traffic && COURSE[r + 1]?.traffic && COURSE[r + 1].type === 'road') {
      for (let x = ox() % t; x < W(); x += t) {
        k.drawRect({
          pos: k.vec2(x + t * 0.25, y - 1.5),
          width: t * 0.5,
          height: 3,
          color: k.rgb(235, 235, 220),
        });
      }
    }
    if (row.type === 'cycle') {
      k.drawText({
        text: row.traffic!.dir > 0 ? '>' : '<',
        pos: k.vec2(colX(COLS / 2), y + t / 2),
        size: t * 0.5,
        anchor: 'center',
        color: WHITE,
        opacity: 0.35,
      });
    }
    if (row.type === 'building' || row.type === 'goal') {
      // Sign above the doorway.
      const door = row.tiles!.search(/[.D]/);
      k.drawText({
        text: row.type === 'goal' ? 'SBR' : 'GSR',
        pos: k.vec2(colX(door) + t / 2, y + t * 0.12),
        size: t * 0.22,
        anchor: 'top',
        color: RED,
      });
    }
    drawTiles(r, y, t);
    // Darken outside the playable columns.
    k.drawRect({ pos: k.vec2(0, y), width: ox(), height: t, color: k.rgb(0, 0, 0), opacity: 0.25 });
    k.drawRect({
      pos: k.vec2(ox() + COLS * tile(), y),
      width: ox(),
      height: t,
      color: k.rgb(0, 0, 0),
      opacity: 0.25,
    });
  }

  function drawVehicle(v: Vehicle, y: number, dir: number): void {
    const t = tile();
    const x = colX(v.x);
    const w = v.len * t;
    const cy = y + t / 2;
    const front = dir > 0 ? x + w : x;
    if (v.kind === 'bus') {
      const h = t * 0.82;
      k.drawRect({
        pos: k.vec2(x + 3, cy - h / 2 + 4),
        width: w,
        height: h,
        color: k.rgb(0, 0, 0),
        opacity: 0.25,
        radius: t * 0.12,
      });
      k.drawRect({
        pos: k.vec2(x, cy - h / 2),
        width: w,
        height: h,
        color: k.rgb(...v.color),
        radius: t * 0.12,
      });
      // Top-deck windows along both sides and a cream roof.
      k.drawRect({
        pos: k.vec2(x + t * 0.12, cy - h / 2 + t * 0.08),
        width: w - t * 0.24,
        height: h - t * 0.16,
        color: k.rgb(235, 228, 205),
        radius: t * 0.08,
      });
      k.drawRect({
        pos: k.vec2(dir > 0 ? front - t * 0.18 : front + t * 0.04, cy - h * 0.38),
        width: t * 0.14,
        height: h * 0.76,
        color: k.rgb(40, 50, 70),
      });
      k.drawText({
        text: v.label,
        pos: k.vec2(x + w / 2, cy),
        size: t * 0.45,
        anchor: 'center',
        color: k.rgb(...v.color),
      });
      return;
    }
    if (v.kind === 'scooter') {
      k.drawRect({
        pos: k.vec2(x, cy - t * 0.1),
        width: w,
        height: t * 0.2,
        color: k.rgb(50, 50, 55),
        radius: t * 0.08,
      });
      // Delivery box on the back, rider in front of it.
      const back = dir > 0 ? x : x + w;
      k.drawRect({
        pos: k.vec2(back + dir * t * 0.22, cy),
        width: t * 0.42,
        height: t * 0.42,
        anchor: 'center',
        color: k.rgb(...v.color),
        outline: { width: 1.5, color: k.rgb(30, 30, 30) },
      });
      k.drawCircle({
        pos: k.vec2(back + dir * t * 0.6, cy),
        radius: t * 0.17,
        color: k.rgb(20, 20, 24),
      });
      return;
    }
    // Bike: two wheels, a frame and the rider.
    for (const f of [0.15, 0.85]) {
      k.drawEllipse({
        pos: k.vec2(x + w * f, cy),
        radiusX: t * 0.1,
        radiusY: t * 0.04,
        color: k.rgb(20, 20, 20),
      });
    }
    k.drawLine({
      p1: k.vec2(x + w * 0.15, cy),
      p2: k.vec2(x + w * 0.85, cy),
      width: 2,
      color: k.rgb(120, 120, 130),
    });
    k.drawCircle({
      pos: k.vec2(x + w / 2 - dir * w * 0.05, cy),
      radius: t * 0.16,
      color: k.rgb(...v.color),
    });
    k.drawCircle({
      pos: k.vec2(x + w / 2 + dir * w * 0.08, cy),
      radius: t * 0.09,
      color: k.rgb(235, 200, 170),
    });
  }

  function drawPlayer(): void {
    const t = tile();
    const p = playerPos();
    const x = colX(p.x);
    const ground = rowY(p.r) + t / 2;
    const y = ground - p.lift * t * 0.3;
    const flat = state === 'dead' && death !== 'eagle' && death !== 'lawn';
    if (state === 'dead' && death === 'eagle' && deathT > 0.8) return;
    k.drawEllipse({
      pos: k.vec2(x, ground + t * 0.2),
      radiusX: t * 0.28,
      radiusY: t * 0.08,
      color: k.rgb(0, 0, 0),
      opacity: 0.25,
    });
    if (flat) {
      // Squashed flat on the road.
      k.drawEllipse({
        pos: k.vec2(x, ground),
        radiusX: t * 0.45,
        radiusY: t * 0.12,
        color: k.rgb(20, 20, 26),
      });
      k.drawRect({
        pos: k.vec2(x - t * 0.3, ground - t * 0.04),
        width: t * 0.6,
        height: t * 0.08,
        color: RED,
      });
      return;
    }
    // Black gown, LMBC red scarf, roster face.
    k.drawRect({
      pos: k.vec2(x, y + t * 0.05),
      width: t * 0.5,
      height: t * 0.4,
      anchor: 'center',
      color: k.rgb(20, 20, 26),
      radius: t * 0.1,
    });
    k.drawRect({
      pos: k.vec2(x, y - t * 0.12),
      width: t * 0.42,
      height: t * 0.08,
      anchor: 'center',
      color: RED,
    });
    const head = k.vec2(x, y - t * 0.25);
    if (walker && k.getSprite('walker')?.data) {
      k.drawSprite({
        sprite: 'walker',
        pos: head,
        width: t * 0.42,
        height: t * 0.42,
        anchor: 'center',
      });
    } else {
      k.drawCircle({ pos: head, radius: t * 0.19, color: k.rgb(235, 200, 170) });
    }
  }

  // The crest eagle: circles while you dawdle, then swoops.
  function drawEagle(): void {
    const t = tile();
    const p = playerPos();
    const px = colX(p.x);
    const py = rowY(p.r) + t / 2;
    let x: number;
    let y: number;
    let s: number;
    if (state === 'dead' && death === 'eagle') {
      const a = Math.min(1, deathT / 0.8);
      x = px + (1 - a) * W() * 0.3;
      y = deathT < 0.8 ? py - (1 - a) * H() * 0.6 : py - (deathT - 0.8) * H() * 0.9;
      s = t * 1.4;
    } else if (state === 'play' && idleT > data.eagleWarn) {
      // Shadow circling the player.
      const a = time * 3;
      k.drawEllipse({
        pos: k.vec2(px + Math.cos(a) * t * 1.2, py + Math.sin(a) * t * 0.6),
        radiusX: t * 0.6,
        radiusY: t * 0.25,
        color: k.rgb(0, 0, 0),
        opacity: 0.3,
      });
      return;
    } else return;
    const flap = Math.sin(time * 18) * 0.5;
    for (const side of [-1, 1]) {
      k.drawPolygon({
        pts: [
          k.vec2(x, y),
          k.vec2(x + side * s, y - s * (0.2 + flap)),
          k.vec2(x + side * s * 0.8, y + s * 0.15),
        ],
        color: GOLD,
        outline: { width: 2, color: k.rgb(140, 110, 30) },
      });
    }
    k.drawEllipse({ pos: k.vec2(x, y), radiusX: s * 0.2, radiusY: s * 0.35, color: GOLD });
    k.drawCircle({ pos: k.vec2(x, y - s * 0.38), radius: s * 0.13, color: GOLD });
    k.drawCircle({ pos: k.vec2(x, y - s * 0.52), radius: s * 0.07, color: k.rgb(230, 200, 60) });
  }

  function banner(text: string, y: number, color = RED): void {
    const bw = Math.min(W() * 0.92, H() * 0.95);
    k.drawRect({
      pos: k.vec2(W() / 2, y),
      width: bw,
      height: H() * 0.09,
      anchor: 'center',
      color,
      outline: { width: 3, color: GOLD },
      radius: 8,
    });
    k.drawText({
      text,
      pos: k.vec2(W() / 2, y),
      size: Math.min(H() * 0.024, W() * 0.038),
      width: bw * 0.92,
      align: 'center',
      anchor: 'center',
      color: WHITE,
    });
  }

  function drawHud(): void {
    const size = H() * 0.035;
    const y = H() * 0.02;
    const shadowed = (
      text: string,
      x: number,
      anchor: 'topleft' | 'top' | 'topright',
      s = size,
    ) => {
      k.drawText({
        text,
        pos: k.vec2(x + 2, y + 2),
        size: s,
        anchor,
        color: k.rgb(0, 0, 0),
        opacity: 0.5,
      });
      k.drawText({ text, pos: k.vec2(x, y), size: s, anchor, color: WHITE });
    };
    shadowed(String(score), H() * 0.02, 'topleft');
    shadowed(`Trip ${trip}`, W() - H() * 0.02, 'topright', size * 0.7);
    const here = COURSE[Math.round(playerPos().r)]?.name ?? '';
    shadowed(here, W() / 2, 'top', Math.min(size * 0.75, W() * 0.04));

    if (state === 'play' && idleT > data.eagleWarn) banner(data.eagleWarnText, H() * 0.14);
    else if (factT > 0 && (state === 'play' || state === 'won')) banner(fact, H() * 0.14);

    let lines: string[] = [];
    if (state === 'ready') lines = [data.subtitle, data.intro];
    else if (state === 'won') lines = [winLine, `Score ${score}`];
    else if (state === 'dead') {
      lines = [deathLine, `Score ${score}   Best ${best}`, deathT > 0.7 ? data.restart : ''];
    }
    if (!lines.length) return;
    const bw = Math.min(W() * 0.92, H() * 0.95);
    const cy = H() * 0.5;
    k.drawRect({
      pos: k.vec2(W() / 2, cy),
      width: bw,
      height: H() * (0.1 + 0.065 * (lines.length - 1)),
      anchor: 'center',
      color: k.rgb(20, 20, 30),
      opacity: 0.8,
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
    // Stone beyond the top of the course (the Chapel side of First Court).
    k.drawRect({ pos: k.vec2(0, 0), width: W(), height: H(), color: k.rgb(176, 160, 122) });
    for (let r = 0; r < COURSE.length; r++) drawRow(r);
    const pr = Math.round(playerPos().r);
    // Traffic bottom to top, with the player drawn in its own lane.
    for (let r = 0; r < COURSE.length; r++) {
      const t = COURSE[r].traffic;
      if (!t) continue;
      const y = rowY(r);
      if (y > H() || y + tile() < 0) continue;
      for (const v of lanes[r].vehicles) drawVehicle(v, y, t.dir);
      if (r === pr) drawPlayer();
    }
    if (!COURSE[pr]?.traffic) drawPlayer();
    // A porter appears for the lawn.
    if (state === 'dead' && death === 'lawn') {
      const t = tile();
      const p = playerPos();
      const x = colX(p.x) + t * 0.8;
      const y = rowY(p.r) + t / 2;
      k.drawRect({
        pos: k.vec2(x, y),
        width: t * 0.5,
        height: t * 0.45,
        anchor: 'center',
        color: k.rgb(30, 30, 40),
        radius: t * 0.08,
      });
      k.drawCircle({ pos: k.vec2(x, y - t * 0.3), radius: t * 0.17, color: k.rgb(235, 200, 170) });
      k.drawEllipse({
        pos: k.vec2(x, y - t * 0.42),
        radiusX: t * 0.22,
        radiusY: t * 0.07,
        color: k.rgb(20, 20, 20),
      });
    }
    drawEagle();
    drawHud();
  });
}
