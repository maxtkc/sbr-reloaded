// Pacman in the Fisher Building: dodge the bouncers, get on the list, reach the dancefloor.
import type { KAPLAYCtx } from 'kaplay';
import { startKaplay } from '../../chaos/shared/kaplay';
import { beep, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  face: string;
}

// Grid position plus progress p (0-1) towards the next tile in direction dir (-1 = still).
interface Mover {
  tx: number;
  ty: number;
  dir: number;
  p: number;
}

type BouncerState = 'home' | 'leaving' | 'active' | 'eyes' | 'entering';

interface Bouncer extends Mover {
  state: BouncerState;
  // Free position while scripted in and out of the security room.
  fx: number;
  fy: number;
  homeX: number;
  release: number;
  scared: boolean;
  combo: number;
}

type State = 'ready' | 'start' | 'play' | 'caught' | 'won' | 'over';

const MAZE = data.maze;
const ROWS = MAZE.length;
const COLS = MAZE[0].length;
// Directions: up, right, down, left.
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const rev = (d: number) => (d < 0 ? -1 : (d + 2) % 4);
// Tie-break order at junctions: up, left, down, right.
const PREFER = [0, 3, 2, 1];
// Scatter corners per bouncer.
const CORNERS = [
  [COLS - 2, -2],
  [1, -2],
  [COLS - 2, ROWS + 1],
  [1, ROWS + 1],
];
// Scatter/chase schedule in seconds, the last phase lasts forever.
const MODES = [6, 20, 5, 20, 5, 20, 5];
const TIES: [number, number, number][] = [
  [220, 40, 50],
  [240, 130, 190],
  [60, 200, 220],
  [245, 150, 50],
];
const NEON: [number, number, number][] = [
  [90, 255, 130],
  [255, 90, 210],
  [90, 200, 255],
  [255, 230, 80],
];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wrapX = (x: number) => (x + COLS) % COLS;

function find(ch: string): [number, number][] {
  const out: [number, number][] = [];
  MAZE.forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push([x, y])));
  return out;
}

function readRoster(): RosterEntry[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem('pacman-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('pacman-best', String(n));
  } catch {
    // Storage unavailable.
  }
}

export default function start(root: HTMLElement): () => void {
  let stop: (() => void) | undefined;
  let stopped = false;
  startKaplay(root, { background: [10, 10, 18], pixelDensity: devicePixelRatio }).then((ctx) => {
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
  const dancer = pick(readRoster().filter((m) => m.face));
  if (dancer) k.loadSprite('dancer', dancer.face);

  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const RED = k.rgb(200, 16, 46);
  const NAVY = k.rgb(27, 42, 74);
  const GOLD = k.rgb(209, 185, 72);
  const WHITE = k.rgb(255, 255, 255);
  const FLOOR = k.rgb(14, 14, 22);
  const SKIN = k.rgb(222, 180, 150);
  const [startX, startY] = find('P')[0];
  const spawns = find('B');
  // The outside spawn (first in scan order) sits above the door.
  const [doorX, doorY] = spawns[0];
  const houseY = spawns[1][1];
  const ROPE = find('-');

  let state: State = 'ready';
  let stateT = 0;
  let grid: string[][] = [];
  let pellets = 0;
  let ropeDown = false;
  let level = 1;
  let lives = 3;
  let score = 0;
  let best = loadBest();
  let time = 0;
  let roundT = 0;
  let modeIdx = 0;
  let modeT = 0;
  let frightT = 0;
  let want = -1;
  let face = 0;
  let line = '';
  let factIndex = Math.floor(Math.random() * data.facts.length);
  let banner = '';
  let bannerT = 0;
  let bubble: { who: number; text: string; t: number } | null = null;
  let shoutWait = 2;
  let popups: { x: number; y: number; text: string; t: number }[] = [];
  let chomp = 0;
  let downPos: { x: number; y: number } | null = null;
  const player: Mover = { tx: startX, ty: startY, dir: -1, p: 0 };
  let bouncers: Bouncer[] = [];

  // Layout: HUD band on top, banner band at the bottom, maze centred between.
  const H = () => k.height();
  const W = () => k.width();
  const hudH = () => H() * 0.07;
  const footH = () => H() * 0.11;
  const tile = () => Math.min(W() / COLS, (H() - hudH() - footH()) / ROWS);
  const ox = () => (W() - COLS * tile()) / 2;
  // Maze sits just under the HUD, with any spare height split above and below it.
  const oy = () => hudH() + Math.min(tile() * 0.5, (H() - hudH() - footH() - ROWS * tile()) / 2);
  // Screen centre of a tile coordinate (tile centres sit on whole numbers).
  const sx = (x: number) => ox() + (x + 0.5) * tile();
  const sy = (y: number) => oy() + (y + 0.5) * tile();

  const cell = (x: number, y: number) => (y < 0 || y >= ROWS ? '#' : grid[y][wrapX(x)]);
  const walkPlayer = (x: number, y: number) => {
    const c = cell(x, y);
    return c !== '#' && c !== '=' && (c !== '-' || ropeDown);
  };
  const walkBouncer = (x: number, y: number) => !'#=-F'.includes(cell(x, y));
  const pos = (m: Mover) => ({
    x: m.tx + (m.dir < 0 ? 0 : DX[m.dir] * m.p),
    y: m.ty + (m.dir < 0 ? 0 : DY[m.dir] * m.p),
  });
  const bpos = (b: Bouncer) =>
    b.state === 'active' || b.state === 'eyes' ? pos(b) : { x: b.fx, y: b.fy };
  const levelSpeed = () => Math.min(1.4, 1 + 0.08 * (level - 1));

  function resetLevel(): void {
    grid = MAZE.map((r) => [...r]);
    pellets = grid.flat().filter((c) => c === '.' || c === 'o').length;
    ropeDown = false;
  }

  function resetPositions(): void {
    Object.assign(player, { tx: startX, ty: startY, dir: -1, p: 0 });
    want = -1;
    face = 3;
    roundT = 0;
    modeIdx = 0;
    modeT = 0;
    frightT = 0;
    bubble = null;
    shoutWait = rand(1.5, 3);
    popups = [];
    bouncers = spawns.map(([x, y], i) => ({
      tx: x,
      ty: y,
      dir: i === 0 ? 3 : -1,
      p: 0,
      state: i === 0 ? 'active' : 'home',
      fx: x,
      fy: y,
      homeX: x,
      release: [0, 1, 4, 7][i] / levelSpeed(),
      scared: false,
      combo: 0,
    }));
  }

  function newGame(): void {
    level = 1;
    lives = 3;
    score = 0;
    resetLevel();
    resetPositions();
    setState('start');
  }

  function setState(s: State): void {
    state = s;
    stateT = 0;
  }

  function showBanner(text: string, t = 4): void {
    banner = text;
    bannerT = t;
  }

  function showFact(): void {
    showBanner(data.facts[factIndex++ % data.facts.length], 4.5);
  }

  function addScore(n: number): void {
    score += n;
    if (score > best) {
      best = score;
      saveBest(best);
    }
  }

  // Moves m by dist tiles, calling arrive() on each new tile and decide() whenever it needs a direction.
  function step(m: Mover, dist: number, arrive: () => boolean, decide: () => void): void {
    let guard = 0;
    while (dist > 0 && guard++ < 8) {
      if (m.dir < 0) {
        decide();
        if (m.dir < 0) return;
      }
      const need = 1 - m.p;
      if (dist < need) {
        m.p += dist;
        return;
      }
      dist -= need;
      m.tx = wrapX(m.tx + DX[m.dir]);
      m.ty += DY[m.dir];
      m.p = 0;
      if (arrive()) return;
      decide();
    }
  }

  function decidePlayer(): void {
    const { tx, ty } = player;
    if (want >= 0 && walkPlayer(tx + DX[want], ty + DY[want])) player.dir = want;
    else if (player.dir >= 0 && !walkPlayer(tx + DX[player.dir], ty + DY[player.dir]))
      player.dir = -1;
    if (player.dir >= 0) face = player.dir;
  }

  function arrivePlayer(): boolean {
    const { tx, ty } = player;
    const c = grid[ty][tx];
    if (c === '.' || c === 'o') {
      grid[ty][tx] = ' ';
      pellets--;
      if (c === '.') {
        addScore(10);
        beep(pellets % 2 ? 520 : 640, 40, 'triangle', 0.04);
      } else {
        addScore(50);
        powerUp();
      }
      if (pellets === 0) {
        ropeDown = true;
        showBanner(data.onList, 3);
        [660, 880, 990].forEach((f, i) => beep(f, 120, 'square', 0.06, i * 90));
      }
    } else if (c === 'F') {
      win();
      return true;
    }
    return false;
  }

  function powerUp(): void {
    frightT = Math.max(3, 7 - 0.5 * (level - 1));
    for (const b of bouncers) b.combo = 0;
    const active = bouncers.filter((b) => b.state === 'active');
    for (const b of active) {
      b.scared = true;
      if (b.p > 0) {
        // Turn round on the spot.
        b.tx = wrapX(b.tx + DX[b.dir]);
        b.ty += DY[b.dir];
        b.p = 1 - b.p;
        b.dir = rev(b.dir);
      }
    }
    beep(180, 300, 'sawtooth', 0.06);
    const who = pick(active);
    if (who) bubble = { who: bouncers.indexOf(who), text: pick(data.scared), t: 2.2 };
    showFact();
  }

  function target(b: Bouncer, i: number): [number, number] {
    if (b.state === 'eyes') return [doorX, doorY];
    const scatter = modeIdx % 2 === 0;
    if (scatter) return CORNERS[i] as [number, number];
    const pd = player.dir < 0 ? face : player.dir;
    switch (i) {
      case 1:
        return [player.tx + DX[pd] * 4, player.ty + DY[pd] * 4];
      case 2: {
        const ax = player.tx + DX[pd] * 2;
        const ay = player.ty + DY[pd] * 2;
        return [2 * ax - bouncers[0].tx, 2 * ay - bouncers[0].ty];
      }
      case 3: {
        const d = Math.hypot(player.tx - b.tx, player.ty - b.ty);
        return d > 7 ? [player.tx, player.ty] : (CORNERS[3] as [number, number]);
      }
      default:
        return [player.tx, player.ty];
    }
  }

  function decideBouncer(b: Bouncer, i: number): void {
    let opts = PREFER.filter((d) => d !== rev(b.dir) && walkBouncer(b.tx + DX[d], b.ty + DY[d]));
    if (!opts.length) opts = [rev(b.dir)];
    if (b.scared && b.state === 'active') {
      b.dir = pick(opts);
      return;
    }
    const [gx, gy] = target(b, i);
    let bestD = Infinity;
    for (const d of opts) {
      const dd = (b.tx + DX[d] - gx) ** 2 + (b.ty + DY[d] - gy) ** 2;
      if (dd < bestD) {
        bestD = dd;
        b.dir = d;
      }
    }
  }

  // Scripted moves inside the security room and through its door.
  function moveScripted(b: Bouncer, dt: number): void {
    const v = 3 * dt * slow;
    const toward = (a: number, goal: number) =>
      Math.abs(goal - a) <= v ? goal : a + Math.sign(goal - a) * v;
    if (b.state === 'home') {
      b.fy = houseY + Math.sin(time * 6 + b.homeX) * 0.15;
      if (roundT > b.release) b.state = 'leaving';
    } else if (b.state === 'leaving') {
      // Across to the door, then up through it.
      if (b.fx !== doorX) {
        b.fx = toward(b.fx, doorX);
        b.fy = toward(b.fy, houseY);
      } else {
        b.fy = toward(b.fy, doorY);
        if (b.fy === doorY) {
          Object.assign(b, { state: 'active', tx: doorX, ty: doorY, p: 0, dir: pick([1, 3]) });
          b.scared = false;
        }
      }
    } else if (b.state === 'entering') {
      b.fy = toward(b.fy, houseY);
      if (b.fy === houseY) {
        b.state = 'home';
        b.release = roundT + 0.8;
      }
    }
  }

  function moveBouncers(dt: number): void {
    bouncers.forEach((b, i) => {
      if (b.state === 'active' || b.state === 'eyes') {
        let v = 6 * levelSpeed();
        if (b.state === 'eyes') v = 12;
        else if (b.scared) v = 3.5;
        else if (b.ty === 12 && (b.tx <= 4 || b.tx >= COLS - 5)) v *= 0.55;
        step(
          b,
          v * dt * slow,
          () => {
            if (b.state === 'eyes' && b.tx === doorX && b.ty === doorY) {
              Object.assign(b, { state: 'entering', fx: doorX, fy: doorY, dir: -1, p: 0 });
              return true;
            }
            return false;
          },
          () => decideBouncer(b, i),
        );
      } else moveScripted(b, dt);
    });
  }

  function reverseAll(): void {
    for (const b of bouncers) {
      if (b.state !== 'active' || b.scared || b.p === 0) continue;
      b.tx = wrapX(b.tx + DX[b.dir]);
      b.ty += DY[b.dir];
      b.p = 1 - b.p;
      b.dir = rev(b.dir);
    }
  }

  function checkCatch(): void {
    const pp = pos(player);
    bouncers.forEach((b, i) => {
      if (b.state !== 'active') return;
      const bp = pos(b);
      let dx = Math.abs(bp.x - pp.x);
      dx = Math.min(dx, COLS - dx);
      if (dx + Math.abs(bp.y - pp.y) > 0.6) return;
      if (b.scared) {
        const pts = 200 * 2 ** Math.min(3, bouncers.filter((o) => o.combo).length);
        b.combo = pts;
        b.scared = false;
        b.state = 'eyes';
        addScore(pts);
        popups.push({ x: bp.x, y: bp.y, text: String(pts), t: 1 });
        [300, 500, 800].forEach((f, j) => beep(f, 60, 'square', 0.05, j * 50));
        if (bubble?.who === i) bubble = null;
      } else if (state === 'play') {
        caught(i);
      }
    });
  }

  function caught(i: number): void {
    setState('caught');
    lives--;
    line = pick(data.caught);
    bubble = { who: i, text: pick(data.shouts), t: 1.5 };
    boom(350, 0.25);
  }

  function win(): void {
    setState('won');
    addScore(500 * level);
    line = pick(data.wins);
    fanfare();
    showFact();
  }

  function shout(dt: number): void {
    if (bubble) {
      bubble.t -= dt;
      if (bubble.t <= 0) bubble = null;
      return;
    }
    shoutWait -= dt;
    if (shoutWait > 0) return;
    shoutWait = rand(2.5, 4.5);
    const pp = pos(player);
    let who = -1;
    let bestD = 10;
    bouncers.forEach((b, i) => {
      if (b.state !== 'active' || b.scared) return;
      const bp = pos(b);
      const d = Math.hypot(bp.x - pp.x, bp.y - pp.y);
      if (d < bestD) {
        bestD = d;
        who = i;
      }
    });
    if (who >= 0) {
      bubble = { who, text: pick(data.shouts), t: 2.2 };
      beep(140, 80, 'square', 0.03);
    }
  }

  function setWant(d: number): void {
    if (state === 'ready' || (state === 'over' && stateT > 0.7)) {
      newGame();
    }
    want = d;
    // Reversing mid-corridor is allowed at any time.
    if (player.dir >= 0 && d === rev(player.dir) && player.p > 0) {
      player.tx = wrapX(player.tx + DX[player.dir]);
      player.ty += DY[player.dir];
      player.p = 1 - player.p;
      player.dir = d;
      face = d;
    }
  }

  const KEYS: Record<string, number> = {
    up: 0,
    w: 0,
    right: 1,
    d: 1,
    down: 2,
    s: 2,
    left: 3,
    a: 3,
  };
  k.onKeyPress((key) => {
    if (key in KEYS) return setWant(KEYS[key]);
    if (key === 'escape') return;
    if (state === 'ready' || (state === 'over' && stateT > 0.7)) newGame();
  });
  k.onMousePress(() => {
    if (state === 'ready' || (state === 'over' && stateT > 0.7)) newGame();
    const p = k.mousePos();
    downPos = { x: p.x, y: p.y };
  });
  k.onMouseRelease(() => {
    downPos = null;
  });

  // A drag past the threshold turns; keep dragging to chain turns.
  function readSwipe(): void {
    if (!downPos || !k.isMouseDown()) return;
    const p = k.mousePos();
    const dx = p.x - downPos.x;
    const dy = p.y - downPos.y;
    if (Math.hypot(dx, dy) < Math.max(18, tile() * 0.7)) return;
    if (Math.abs(dx) > Math.abs(dy)) setWant(dx > 0 ? 1 : 3);
    else setWant(dy > 0 ? 2 : 0);
    downPos = { x: p.x, y: p.y };
  }

  resetLevel();
  resetPositions();

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 1 / 30);
    time += dt;
    stateT += dt;
    bannerT -= dt;
    for (const p of popups) p.t -= dt;
    popups = popups.filter((p) => p.t > 0);
    readSwipe();

    if (state === 'start') {
      if (stateT > 1.6) setState('play');
      return;
    }
    if (state === 'caught') {
      if (bubble) bubble.t -= dt;
      if (stateT > 1.6) {
        if (lives > 0) {
          resetPositions();
          setState('start');
        } else setState('over');
      }
      return;
    }
    if (state === 'won') {
      if (stateT > 3) {
        level++;
        resetLevel();
        resetPositions();
        setState('start');
      }
      return;
    }
    if (state !== 'play') return;

    roundT += dt;
    if (frightT > 0) {
      frightT -= dt;
      if (frightT <= 0) for (const b of bouncers) b.scared = false;
    } else if (modeIdx < MODES.length) {
      modeT += dt;
      if (modeT > MODES[modeIdx]) {
        modeT = 0;
        modeIdx++;
        reverseAll();
      }
    }

    if (player.dir >= 0 || want >= 0) {
      step(player, 6.5 * dt * slow, arrivePlayer, decidePlayer);
      if (player.dir >= 0) chomp += dt * 14;
    }
    if (state !== 'play') return;
    moveBouncers(dt);
    checkCatch();
    shout(dt);
  });

  function drawMaze(): void {
    const t = tile();
    k.drawRect({ pos: k.vec2(ox(), oy()), width: COLS * t, height: ROWS * t, color: FLOOR });
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = grid[y][x];
        const px = ox() + x * t;
        const py = oy() + y * t;
        if (c === '#') {
          k.drawRect({ pos: k.vec2(px, py), width: t + 0.5, height: t + 0.5, color: NAVY });
          // Red edge wherever the wall meets open floor.
          const edge = (nx: number, ny: number, p1: [number, number], p2: [number, number]) => {
            const n = ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS ? '#' : MAZE[ny][nx];
            if (n === '#') return;
            k.drawLine({
              p1: k.vec2(px + p1[0] * t, py + p1[1] * t),
              p2: k.vec2(px + p2[0] * t, py + p2[1] * t),
              width: Math.max(1.5, t * 0.08),
              color: RED,
            });
          };
          edge(x, y - 1, [0, 0], [1, 0]);
          edge(x + 1, y, [1, 0], [1, 1]);
          edge(x, y + 1, [0, 1], [1, 1]);
          edge(x - 1, y, [0, 0], [0, 1]);
        } else if (c === 'F') {
          const h = ((x + y) * 0.13 + time * 0.4) % 1;
          k.drawRect({
            pos: k.vec2(px + 1, py + 1),
            width: t - 2,
            height: t - 2,
            color: k.hsl2rgb(h, 0.75, (x + y) % 2 ? 0.45 : 0.32),
          });
        } else if (c === '=') {
          k.drawRect({
            pos: k.vec2(px, py + t * 0.42),
            width: t,
            height: t * 0.16,
            color: k.rgb(240, 150, 190),
          });
        } else if (c === '.') {
          const [r, g, b] = NEON[(x + y) % NEON.length];
          k.drawRect({
            pos: k.vec2(px + t / 2, py + t / 2),
            width: t * 0.3,
            height: t * 0.09,
            anchor: 'center',
            angle: (x + y) % 2 ? 45 : -45,
            radius: t * 0.04,
            color: k.rgb(r, g, b),
          });
        } else if (c === 'o') {
          drawHandle(px + t / 2, py + t / 2, t * (0.9 + Math.sin(time * 6) * 0.12));
        }
      }
    }
    drawRope();
    for (const l of data.labels) {
      k.drawText({
        text: l.text,
        pos: k.vec2(sx(l.x), sy(l.y)),
        size: t * 0.42,
        anchor: 'center',
        color: l.text === 'DANCEFLOOR' ? WHITE : k.rgb(235, 225, 200),
        opacity: l.text === 'DANCEFLOOR' ? 0.9 : 0.45,
      });
    }
  }

  // Velvet rope across the dancefloor entrance, swung aside once you are on the list.
  function drawRope(): void {
    const ropes = ROPE;
    if (!ropes.length) return;
    const t = tile();
    const x0 = ox() + ropes[0][0] * t;
    const x1 = ox() + (ropes[ropes.length - 1][0] + 1) * t;
    const y = oy() + ropes[0][1] * t + t * 0.3;
    for (const x of [x0 + t * 0.1, x1 - t * 0.1]) {
      k.drawRect({
        pos: k.vec2(x, y + t * 0.35),
        width: t * 0.14,
        height: t * 0.75,
        anchor: 'bot',
        color: GOLD,
      });
      k.drawCircle({ pos: k.vec2(x, y - t * 0.4), radius: t * 0.1, color: GOLD });
    }
    if (ropeDown) {
      k.drawLine({
        p1: k.vec2(x0 + t * 0.1, y - t * 0.3),
        p2: k.vec2(x0 + t * 0.2, y + t * 0.3),
        width: t * 0.12,
        color: RED,
      });
      return;
    }
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10;
      pts.push(
        k.vec2(
          x0 + t * 0.1 + f * (x1 - x0 - t * 0.2),
          y - t * 0.3 + Math.sin(f * Math.PI) * t * 0.35,
        ),
      );
    }
    k.drawLines({ pts, width: t * 0.12, color: RED });
  }

  // A handle of something strong: amber bottle with a loop handle.
  function drawHandle(x: number, y: number, s: number): void {
    k.drawCircle({
      pos: k.vec2(x + s * 0.17, y),
      radius: s * 0.13,
      fill: false,
      outline: { width: Math.max(1.5, s * 0.06), color: k.rgb(200, 140, 40) },
    });
    k.drawRect({
      pos: k.vec2(x - s * 0.03, y + s * 0.05),
      width: s * 0.34,
      height: s * 0.42,
      anchor: 'center',
      radius: s * 0.06,
      color: k.rgb(200, 140, 40),
    });
    k.drawRect({
      pos: k.vec2(x - s * 0.03, y - s * 0.24),
      width: s * 0.12,
      height: s * 0.16,
      anchor: 'center',
      color: k.rgb(170, 110, 30),
    });
    k.drawRect({
      pos: k.vec2(x - s * 0.03, y + s * 0.05),
      width: s * 0.26,
      height: s * 0.12,
      anchor: 'center',
      color: k.rgb(245, 235, 210),
    });
  }

  function drawPlayer(): void {
    const t = tile();
    const p = pos(player);
    const x = sx(p.x);
    const y = sy(p.y);
    const r = t * 0.46;
    let scale = 1;
    let spin = 0;
    if (state === 'caught') {
      spin = stateT * 720;
      scale = Math.max(0, 1 - stateT / 1.4);
    }
    if (scale <= 0) return;
    const rad = r * scale;
    const center = k.vec2(x, y);
    if (dancer && k.getSprite('dancer')?.data) {
      k.drawMasked(
        () =>
          k.drawSprite({
            sprite: 'dancer',
            pos: center,
            width: rad * 2,
            height: rad * 2,
            anchor: 'center',
            angle: spin,
          }),
        () => k.drawCircle({ pos: center, radius: rad }),
      );
    } else {
      k.drawCircle({ pos: center, radius: rad, color: k.rgb(255, 220, 60) });
    }
    k.drawCircle({
      pos: center,
      radius: rad,
      fill: false,
      outline: { width: Math.max(1.5, t * 0.08), color: GOLD },
    });
    if (state === 'caught') return;
    // Chomping mouth wedge in the floor colour.
    const open = (Math.abs(Math.sin(chomp)) * 0.7 + 0.1) * (player.dir < 0 ? 0.6 : 1);
    const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][face];
    const m = rad * 1.08;
    k.drawPolygon({
      pts: [
        center,
        k.vec2(x + Math.cos(a - open) * m, y + Math.sin(a - open) * m),
        k.vec2(x + Math.cos(a) * m * 1.2, y + Math.sin(a) * m * 1.2),
        k.vec2(x + Math.cos(a + open) * m, y + Math.sin(a + open) * m),
      ],
      color: FLOOR,
    });
  }

  function drawEyes(x: number, y: number, t: number, dir: number): void {
    for (const side of [-1, 1]) {
      const ex = x + side * t * 0.14;
      const ey = y - t * 0.12;
      k.drawCircle({ pos: k.vec2(ex, ey), radius: t * 0.1, color: WHITE });
      const dx = dir < 0 ? 0 : DX[dir];
      const dy = dir < 0 ? 0 : DY[dir];
      k.drawCircle({
        pos: k.vec2(ex + dx * t * 0.05, ey + dy * t * 0.05),
        radius: t * 0.05,
        color: k.rgb(20, 30, 70),
      });
    }
  }

  function drawBouncer(b: Bouncer, i: number): void {
    const t = tile();
    const p = bpos(b);
    const x = sx(p.x);
    const y = sy(p.y);
    const dir = b.state === 'active' || b.state === 'eyes' ? b.dir : 2;
    if (b.state === 'eyes' || b.state === 'entering') return drawEyes(x, y, t, dir);
    const w = t * 0.98;
    const h = t * 1.0;
    const top = y - h / 2;
    if (b.scared) {
      // Frightened: pale and wobbly, flashing when it is about to wear off.
      const flash = frightT < 2 && Math.floor(time * 6) % 2 === 0;
      const body = flash ? k.rgb(245, 245, 255) : k.rgb(120, 150, 255);
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const a = Math.PI + (j / 8) * Math.PI;
        pts.push(k.vec2(x + (Math.cos(a) * w) / 2, y - h * 0.1 + Math.sin(a) * h * 0.4));
      }
      for (let j = 0; j <= 6; j++) {
        const fx = x + w / 2 - (j / 6) * w;
        pts.push(
          k.vec2(fx, y + h / 2 - (j % 2 ? h * 0.12 : 0) + Math.sin(time * 10 + j) * t * 0.03),
        );
      }
      k.drawPolygon({ pts, color: body });
      const ink = flash ? RED : k.rgb(255, 230, 200);
      k.drawCircle({ pos: k.vec2(x - t * 0.13, y - t * 0.12), radius: t * 0.06, color: ink });
      k.drawCircle({ pos: k.vec2(x + t * 0.13, y - t * 0.12), radius: t * 0.06, color: ink });
      const mouth = [];
      for (let j = 0; j <= 6; j++) {
        mouth.push(
          k.vec2(x - t * 0.24 + (j / 6) * t * 0.48, y + t * 0.12 + (j % 2 ? -1 : 1) * t * 0.04),
        );
      }
      k.drawLines({ pts: mouth, width: Math.max(1, t * 0.04), color: ink });
      return;
    }
    // Dark jacket outlined in the bouncer's colour, bald head, earpiece, hi-vis armband and a tie.
    k.drawRect({
      pos: k.vec2(x - w / 2, top + h * 0.3),
      width: w,
      height: h * 0.7,
      radius: [w * 0.3, w * 0.3, t * 0.06, t * 0.06],
      color: k.rgb(58, 58, 70),
      outline: { width: Math.max(1.5, t * 0.07), color: k.rgb(...TIES[i % TIES.length]) },
    });
    k.drawPolygon({
      pts: [
        k.vec2(x - t * 0.07, top + h * 0.38),
        k.vec2(x + t * 0.07, top + h * 0.38),
        k.vec2(x, top + h * 0.82),
      ],
      color: k.rgb(...TIES[i % TIES.length]),
    });
    k.drawRect({
      pos: k.vec2(x - w / 2, top + h * 0.55),
      width: w * 0.2,
      height: h * 0.12,
      color: k.rgb(220, 255, 40),
    });
    k.drawCircle({ pos: k.vec2(x, top + h * 0.28), radius: t * 0.25, color: SKIN });
    drawEyes(x, top + h * 0.38, t * 0.9, dir);
    k.drawLine({
      p1: k.vec2(x + t * 0.24, top + h * 0.3),
      p2: k.vec2(x + t * 0.3, top + h * 0.55),
      width: Math.max(1, t * 0.03),
      color: k.rgb(230, 230, 230),
    });
  }

  function drawBubble(): void {
    if (!bubble || state === 'ready' || state === 'over') return;
    const b = bouncers[bubble.who];
    if (!b || b.state === 'eyes') return;
    const t = tile();
    const p = bpos(b);
    const size = Math.max(11, t * 0.5);
    const tw = bubble.text.length * size * 0.6 + size;
    const bh = size * 1.6;
    const x = Math.max(4 + tw / 2, Math.min(W() - 4 - tw / 2, sx(p.x)));
    let y = sy(p.y) - t * 0.6 - bh / 2;
    let tail = 1;
    if (y - bh / 2 < hudH()) {
      y = sy(p.y) + t * 0.6 + bh / 2;
      tail = -1;
    }
    k.drawPolygon({
      pts: [
        k.vec2(sx(p.x) - size * 0.3, y + (tail * bh) / 2 - tail),
        k.vec2(sx(p.x) + size * 0.3, y + (tail * bh) / 2 - tail),
        k.vec2(sx(p.x), y + (tail * bh) / 2 + tail * size * 0.5),
      ],
      color: WHITE,
    });
    k.drawRect({
      pos: k.vec2(x, y),
      width: tw,
      height: bh,
      anchor: 'center',
      radius: bh * 0.4,
      color: WHITE,
      outline: { width: 2, color: k.rgb(20, 20, 30) },
    });
    k.drawText({
      text: bubble.text,
      pos: k.vec2(x, y),
      size,
      anchor: 'center',
      color: k.rgb(20, 20, 30),
    });
  }

  function shadowed(
    text: string,
    x: number,
    y: number,
    anchor: 'left' | 'center' | 'right',
    s: number,
  ): void {
    k.drawText({
      text,
      pos: k.vec2(x + 2, y + 2),
      size: s,
      anchor,
      color: k.rgb(0, 0, 0),
      opacity: 0.5,
    });
    k.drawText({ text, pos: k.vec2(x, y), size: s, anchor, color: WHITE });
  }

  function drawHud(): void {
    const y = hudH() / 2;
    const s = Math.min(hudH() * 0.45, W() * 0.045);
    const pad = Math.max(10, ox());
    shadowed(String(score), pad, y, 'left', s);
    shadowed(`Level ${level}   Best ${best}`, W() / 2, y, 'center', s * 0.7);
    // Lives as little chompers.
    for (let i = 0; i < lives; i++) {
      const cx = W() - pad - s * 0.5 - i * s * 1.3;
      k.drawCircle({ pos: k.vec2(cx, y), radius: s * 0.5, color: k.rgb(255, 220, 60) });
      k.drawPolygon({
        pts: [
          k.vec2(cx, y),
          k.vec2(cx + s * 0.6, y - s * 0.35),
          k.vec2(cx + s * 0.6, y + s * 0.35),
        ],
        color: k.rgb(10, 10, 18),
      });
    }
    for (const p of popups) {
      k.drawText({
        text: p.text,
        pos: k.vec2(sx(p.x), sy(p.y) - (1 - p.t) * tile()),
        size: tile() * 0.6,
        anchor: 'center',
        color: k.rgb(120, 220, 255),
        opacity: Math.min(1, p.t * 2),
      });
    }

    if (bannerT > 0 && state !== 'ready' && state !== 'over') {
      const bw = Math.min(W() * 0.94, Math.max(COLS * tile(), H() * 0.9));
      const by = Math.min(H() - footH() / 2, oy() + ROWS * tile() + footH() / 2);
      k.drawRect({
        pos: k.vec2(W() / 2, by),
        width: bw,
        height: footH() * 0.82,
        anchor: 'center',
        color: RED,
        outline: { width: 3, color: GOLD },
        radius: 8,
      });
      k.drawText({
        text: banner,
        pos: k.vec2(W() / 2, by),
        size: Math.min(footH() * 0.24, W() * 0.036),
        width: bw * 0.92,
        align: 'center',
        anchor: 'center',
        color: WHITE,
      });
    }

    let lines: string[] = [];
    if (state === 'ready') lines = [data.subtitle, data.intro, data.start];
    else if (state === 'start') lines = [stateT < 0.8 && level > 1 ? `Level ${level}` : data.ready];
    else if (state === 'caught' && stateT > 0.4) lines = [line, lives > 0 ? `${lives} left` : ''];
    else if (state === 'won') lines = [line, `Score ${score}`];
    else if (state === 'over') {
      lines = [data.gameOver, `Score ${score}   Best ${best}`, stateT > 0.7 ? data.restart : ''];
    }
    lines = lines.filter(Boolean);
    if (!lines.length) return;
    const bw = Math.min(W() * 0.92, H() * 0.95);
    const cy = sy(ROWS / 2 - 0.5);
    // Measure each wrapped line so the card fits its text.
    const gap = H() * 0.02;
    const opts = lines.map((text, i) => ({
      text,
      size: Math.min(H() * (i === 0 ? 0.03 : 0.024), W() * (i === 0 ? 0.042 : 0.034)),
      width: bw * 0.92,
      align: 'center' as const,
      anchor: 'top' as const,
      color: i === 0 ? GOLD : WHITE,
    }));
    const texts = opts.map((o) => k.formatText(o));
    const total = texts.reduce((sum, ft) => sum + ft.height, 0) + gap * (texts.length - 1);
    k.drawRect({
      pos: k.vec2(W() / 2, cy),
      width: bw,
      height: total + H() * 0.06,
      anchor: 'center',
      color: k.rgb(20, 20, 30),
      opacity: 0.88,
      radius: 10,
    });
    let ty = cy - total / 2;
    opts.forEach((o, i) => {
      k.drawText({ ...o, pos: k.vec2(W() / 2, ty) });
      ty += texts[i].height + gap;
    });
  }

  k.onDraw(() => {
    drawMaze();
    bouncers.forEach((b, i) => {
      if (b.state !== 'active') drawBouncer(b, i);
    });
    drawPlayer();
    bouncers.forEach((b, i) => {
      if (b.state === 'active') drawBouncer(b, i);
    });
    drawBubble();
    drawHud();
  });
}
