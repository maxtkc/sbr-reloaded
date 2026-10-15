// Bumps: row the Lady Margaret eight up the Cam with one random key per oar and catch the boat ahead.
import { beep, blip, boom, fanfare } from '../../chaos/shared/sfx';
import data from './data.json';

interface RosterEntry {
  name: string;
  role: string;
  face: string;
}

interface Rival {
  name: string;
  hull: string;
  kit: string;
  blade: string;
}

// Computer crew: follows the river centreline at its own pace.
interface Crew {
  rival: Rival;
  x: number;
  v: number;
  base: number;
  lat: number;
  crashT: number;
  side: number;
  phase: number;
  stroke: number;
  next: number;
}

type State = 'ready' | 'countdown' | 'race' | 'bump' | 'prize' | 'caught' | 'over';

// Boat length and drawn beam in metres.
const L = 17.5;
const BEAM = 1.3;
// Oar length outboard of the gate.
const OAR = 4.2;
// Stroke cycle and the drive part of it, in seconds.
const STROKE = 0.9;
const DRIVE = 0.4;
// Mean thrust per oar during the drive (m/s^2), water drag, yaw gain, yaw damping, cox steering gain.
const FORCE = 0.565;
const DRAG = 0.05;
const YAW = 1.25;
const YAW_DAMP = 2.5;
const COX = 1.2;
// Open water between crews at the start.
const START_GAP = 32;
const CRASH_T = 1.4;
const HALF = data.width / 2;
const FINISH = data.finish;
// Stations where computer crews may hit the bank.
const CORNERS = new Set(['First Post Corner', 'Grassy Corner', 'Ditton Corner']);

const RED = '#a3162b';
const RED_DARK = '#7a0f1f';
const GOLD = '#d1b948';
const SKIN = '#e9c3a0';
const INK = '#1d1a17';
const CREAM = '#f4efe4';
const LMBC: Rival = { name: 'Lady Margaret', hull: '#f2ece0', kit: RED, blade: RED };

// Seats 1 (bow) to 8 (stroke): position along the hull from the centre, and side (-1 port, 1 starboard).
// Even seats are stroke side (port), odd seats bow side (starboard).
const SEATS = Array.from({ length: 8 }, (_, i) => ({
  seat: i + 1,
  along: L / 2 - 3.2 - i * 1.45,
  side: (i + 1) % 2 === 0 ? -1 : 1,
}));

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
    return Number(localStorage.getItem('bumps-best')) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem('bumps-best', String(n));
  } catch {
    // Storage unavailable.
  }
}

// Deterministic 0..1 noise for slot i.
function hash(i: number, salt = 0): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
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

// River centreline sampled every metre: linear between course points, then box-smoothed.
const X0 = data.course[0][0];
const X1 = data.course[data.course.length - 1][0];
const centre: number[] = [];
{
  const raw: number[] = [];
  let j = 0;
  for (let x = X0; x <= X1; x++) {
    while (j < data.course.length - 2 && x > data.course[j + 1][0]) j++;
    const [ax, ay] = data.course[j];
    const [bx, by] = data.course[j + 1];
    raw.push(ay + ((by - ay) * (x - ax)) / (bx - ax));
  }
  let src = raw;
  for (let pass = 0; pass < 2; pass++) {
    const out: number[] = [];
    for (let i = 0; i < src.length; i++) {
      let sum = 0;
      let n = 0;
      for (let d = -10; d <= 10; d++) {
        const k = i + d;
        if (k >= 0 && k < src.length) {
          sum += src[k];
          n++;
        }
      }
      out.push(sum / n);
    }
    src = out;
  }
  centre.push(...src);
}
// Distance along the river at each sample.
const along: number[] = [0];
for (let i = 1; i < centre.length; i++)
  along.push(along[i - 1] + Math.hypot(1, centre[i] - centre[i - 1]));

function sample(arr: number[], x: number): number {
  const f = Math.max(0, Math.min(arr.length - 1.001, x - X0));
  const i = Math.floor(f);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}
const cy = (x: number) => sample(centre, x);
const arc = (x: number) => sample(along, x);
const riverAngle = (x: number) => Math.atan2(cy(x + 1) - cy(x - 1), 2);

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Distance from point p to segment ab.
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

// Willow sprig as an SVG string.
function sprigSvg(size: number): string {
  let leaves = '';
  for (let i = 0; i < 9; i++) {
    const y = 104 - i * 11;
    const x = 30 + Math.sin(i * 0.5) * 3;
    const s = i % 2 ? 1 : -1;
    leaves += `<ellipse cx="${x + s * 7}" cy="${y}" rx="3.6" ry="12" fill="${i % 3 ? '#7fae4a' : '#5f8f35'}" transform="rotate(${s * 38} ${x + s * 7} ${y})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 120" width="${size / 2}" height="${size}" aria-hidden="true"><path d="M30 118 C34 90 26 50 30 6" stroke="#6b5a2e" stroke-width="2.4" fill="none"/>${leaves}</svg>`;
}

export default function start(root: HTMLElement): () => void {
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const roster = readRoster().filter((m) => m.face);
  const faces = new Map<string, HTMLImageElement>();
  for (const m of roster) {
    const img = new Image();
    img.src = m.face;
    faces.set(m.face, img);
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

  let state: State = 'ready';
  let stateT = 0;
  let time = 0;
  let wins = 0;
  let best = loadBest();
  // My boat: hull centre, heading, speed along the heading, yaw rate.
  let bx = 0;
  let by = 0;
  let heading = 0;
  let speed = 0;
  let yawRate = 0;
  let crashT = 0;
  // Per seat: its key and time since its catch (-1 = sitting ready).
  let keyOf: string[] = [];
  const strokeT = new Array<number>(8).fill(-1);
  const held = new Set<string>();
  let ahead: Crew;
  let chaser: Crew;
  let cox: RosterEntry | undefined;
  let camX = 0;
  let camY = 0;
  let nextStation = 1;
  let place = data.stations[0].name;
  let fact = '';
  let factT = 0;
  let flash = '';
  let flashT = 0;
  let coxLine = '';
  let coxT = 0;
  let whistle = 0;
  let line = '';
  let puddles: { x: number; y: number; life: number }[] = [];
  let prize: HTMLElement | undefined;

  function crew(rival: Rival, x: number, base: number): Crew {
    return {
      rival,
      x,
      v: 0,
      base,
      lat: 0,
      crashT: 0,
      side: 1,
      phase: Math.random() * 10,
      stroke: Math.random() * STROKE,
      next: 1,
    };
  }

  function reset(): void {
    prize?.remove();
    prize = undefined;
    keyOf = shuffle([...data.keys]).slice(0, 8);
    strokeT.fill(-1);
    held.clear();
    const [r1, r2] = shuffle(data.rivals);
    bx = 30;
    by = cy(bx);
    heading = riverAngle(bx);
    speed = 0;
    yawRate = 0;
    crashT = 0;
    ahead = crew(r1, bx + L + START_GAP, 4.8 + wins * 0.25);
    chaser = crew(r2, bx - L - START_GAP, 4.2 + wins * 0.2);
    cox = roster.length ? pick(roster) : undefined;
    camX = bx;
    camY = by;
    state = 'ready';
    stateT = 0;
    time = 0;
    nextStation = 1;
    place = data.stations[0].name;
    factT = 0;
    flashT = 0;
    coxT = 0;
    whistle = 0;
    puddles = [];
  }

  function showFact(text: string): void {
    fact = text;
    factT = 6;
  }

  function showFlash(text: string, t = 1.6): void {
    flash = text;
    flashT = t;
  }

  function say(text: string): void {
    coxLine = text;
    coxT = 4.5;
  }

  // Ends of a hull centred at (x, y) with heading a.
  function ends(x: number, y: number, a: number) {
    const c = Math.cos(a) * (L / 2);
    const s = Math.sin(a) * (L / 2);
    return { bow: { x: x + c, y: y + s }, stern: { x: x - c, y: y - s } };
  }

  function crewPose(c: Crew) {
    const a = riverAngle(c.x) + (c.crashT > 0 ? c.side * 0.35 * Math.min(1, c.crashT) : 0);
    const y = cy(c.x) + c.lat;
    return { x: c.x, y, a, ...ends(c.x, y, a) };
  }

  // Seat catches on a key press or while its key is held.
  function catchSeat(i: number): void {
    if (state !== 'race' || crashT > 0) return;
    if (strokeT[i] >= 0 && strokeT[i] < STROKE) return;
    strokeT[i] = 0;
    beep(180 + i * 12, 45, 'triangle', 0.035);
  }

  function crash(): void {
    crashT = CRASH_T;
    speed *= -0.15;
    yawRate = 0;
    strokeT.fill(-1);
    say(pick(data.crashes));
    boom(220, 0.15);
  }

  function endRace(next: State, text: string): void {
    state = next;
    stateT = 0;
    line = text;
  }

  function updateCrew(c: Crew, dt: number, t: number): void {
    const bow = c.x + L / 2;
    if (c.next < data.stations.length && bow >= data.stations[c.next].at) {
      const st = data.stations[c.next++];
      if (CORNERS.has(st.name) && Math.random() < 0.3) {
        c.crashT = 2.2;
        // Into the bank on the outside of the bend.
        c.side = -Math.sign(riverAngle(st.at + 15) - riverAngle(st.at - 15)) || 1;
        c.v = 0;
        if (c === ahead && state === 'race')
          showFlash(data.rivalCrash.replace('{crew}', c.rival.name).replace('{place}', st.name), 2);
      }
    }
    let target = c.base + 0.45 * Math.sin(t * 0.7 + c.phase) + 0.25 * Math.sin(t * 1.9 + c.phase);
    if (c.crashT > 0) {
      c.crashT -= dt;
      target = 0;
    }
    // Rowed past the finish: wind down.
    if (bow > FINISH + 25) target = 0;
    c.v += Math.max(-3 * dt, Math.min(1.5 * dt, target - c.v));
    c.x += c.v * Math.cos(riverAngle(c.x)) * dt;
    const want = c.crashT > 0 ? c.side * (HALF - 3) : 2.5 * Math.sin(t * 0.23 + c.phase);
    c.lat += (want - c.lat) * Math.min(1, dt * 1.5);
    if (c.v > 0.5) c.stroke = (c.stroke + dt * (0.6 + c.v / 7)) % STROKE;
  }

  function update(dt: number): void {
    stateT += dt;
    factT -= dt;
    flashT -= dt;
    coxT -= dt;
    for (const p of puddles) p.life -= dt;
    puddles = puddles.filter((p) => p.life > 0);

    if (state === 'countdown') {
      const step = Math.floor(stateT / 0.9);
      if (step >= data.countdown.length - 1) {
        state = 'race';
        stateT = 0;
        showFlash(data.countdown[data.countdown.length - 1], 1);
        showFact(data.stations[0].fact);
        boom(400, 0.35);
      } else showFlash(data.countdown[step], 0.3);
    }
    const racing = state === 'race';
    if (racing) time += dt;
    const moving = racing || state === 'bump' || state === 'caught' || state === 'over';
    if (!moving) return;

    // Strokes: thrust and yaw from oars in their drive, scaled up when the crew is together.
    let thrust = 0;
    let yaw = 0;
    let inDrive = 0;
    for (let i = 0; i < 8; i++) {
      if (strokeT[i] < 0) continue;
      const before = strokeT[i];
      strokeT[i] += dt;
      if (before < DRIVE && strokeT[i] >= DRIVE) {
        const tip = bladeTip(i);
        puddles.push({ x: tip.x, y: tip.y, life: 3 });
      }
      if (strokeT[i] >= STROKE) {
        strokeT[i] = -1;
        if (racing && held.has(keyOf[i])) catchSeat(i);
        continue;
      }
      if (strokeT[i] < DRIVE) {
        inDrive++;
        const f = FORCE * (Math.PI / 2) * Math.sin((Math.PI * strokeT[i]) / DRIVE);
        thrust += f;
        // Pulling a port oar turns the boat to starboard.
        yaw -= SEATS[i].side * f;
      }
    }
    const together = 0.6 + 0.8 * (inDrive / 8);
    if (!racing) thrust = 0;
    speed +=
      (thrust * together - DRAG * speed * Math.abs(speed) - 0.3 * Math.abs(yawRate) * speed) * dt;
    if (!racing) speed *= Math.pow(0.4, dt);

    const bowPt = ends(bx, by, heading).bow;
    if (crashT > 0) {
      // Pushed off the bank: ease back towards the middle and the river's direction.
      crashT -= dt;
      by += (cy(bx) - by) * Math.min(1, dt * 1.3);
      heading += wrapAngle(riverAngle(bx) - heading) * Math.min(1, dt * 2.2);
      yawRate = 0;
    } else {
      // The cox steers for the middle of the river a little way ahead, more effectively at speed.
      const look = 12;
      const aim = Math.atan2(cy(bowPt.x + look) - bowPt.y, look);
      const steer = COX * wrapAngle(aim - heading) * Math.min(1, Math.abs(speed) / 4);
      yawRate += (YAW * yaw * together + steer - YAW_DAMP * yawRate) * dt;
      heading += yawRate * dt;
    }
    bx += Math.cos(heading) * speed * dt;
    by += Math.sin(heading) * speed * dt;

    const me = ends(bx, by, heading);
    if (crashT <= 0) {
      for (const p of [me.bow, me.stern]) {
        if (Math.abs(p.y - cy(p.x)) > HALF - 0.4) {
          crash();
          break;
        }
      }
    }

    const t = time + stateT;
    updateCrew(ahead, dt, t);
    updateCrew(chaser, dt, t);
    camX += (bx - camX) * Math.min(1, dt * 5);
    camY += ((by + cy(bx)) / 2 - camY) * Math.min(1, dt * 3);
    if (!racing) return;

    // Stations passed by my bow.
    while (nextStation < data.stations.length && me.bow.x >= data.stations[nextStation].at) {
      const st = data.stations[nextStation++];
      place = st.name;
      showFact(st.fact);
      blip();
    }

    const a = crewPose(ahead);
    const c = crewPose(chaser);
    const gapAhead = arc(a.stern.x) - arc(me.bow.x);
    const gapBehind = arc(me.stern.x) - arc(c.bow.x);

    // Bank party whistles as the gap to the boat ahead closes.
    const level = gapAhead < L * 0.5 ? 3 : gapAhead < L ? 2 : gapAhead < L * 1.5 ? 1 : 0;
    if (level > whistle) {
      for (let k = 0; k < level; k++) beep(2600, 110, 'sine', 0.05, k * 170);
    }
    whistle = level;

    if (coxT < -1.5) {
      if (gapAhead < L * 0.8) say(pick(data.coxClose));
      else if (gapBehind < L * 0.8) say(pick(data.coxChased));
      else say(pick(data.cox));
    }

    if (
      segDist(me.bow.x, me.bow.y, a.stern.x, a.stern.y, a.bow.x, a.bow.y) < 3.2 ||
      arc(me.bow.x) > arc(a.x)
    ) {
      endRace('bump', pick(data.bumpLines));
      ahead.v = 0;
      ahead.base = 0;
      showFlash(data.prizeTitle, 2);
      fanfare();
      if (!best || time < best) {
        best = time;
        saveBest(Math.round(time * 10) / 10);
      }
      wins++;
    } else if (
      segDist(c.bow.x, c.bow.y, me.stern.x, me.stern.y, me.bow.x, me.bow.y) < 3.2 ||
      arc(c.bow.x) > arc(bx)
    ) {
      endRace('caught', pick(data.caughtLines).replace('{crew}', chaser.rival.name));
      chaser.base = 0;
      showFact(pick(data.stations).fact);
      boom();
    } else if (me.bow.x >= FINISH) {
      endRace('over', pick(data.rowOverLines));
      showFact(data.stations[data.stations.length - 1].fact);
      beep(330, 300, 'triangle', 0.08);
    }
  }

  // Blade sweep angle: forward at the catch, back at the finish, recovering forward again.
  function sweep(t: number): number {
    if (t < 0) return 0.6;
    if (t < DRIVE) return 0.6 - 1.2 * (0.5 - 0.5 * Math.cos((Math.PI * t) / DRIVE));
    const u = (t - DRIVE) / (STROKE - DRIVE);
    return -0.6 + 1.2 * (0.5 - 0.5 * Math.cos(Math.PI * u));
  }

  // World position of seat i's blade tip on my boat.
  function bladeTip(i: number, extra = 0) {
    const { along: al, side } = SEATS[i];
    const phi = sweep(strokeT[i]);
    const lx = al + Math.sin(phi) * (OAR + extra);
    const ly = side * (BEAM / 2 + 0.5 + Math.cos(phi) * (OAR + extra));
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    return { x: bx + lx * c - ly * s, y: by + lx * s + ly * c };
  }

  // ---- Drawing ----

  const scale = () => Math.min(W / 75, H / 34);
  const sx = (x: number) => W * 0.42 + (x - camX) * scale();
  const sy = (y: number) => H * 0.48 + (y - camY) * scale();

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

  function visibleRange(): [number, number] {
    const k = scale();
    return [camX - (W * 0.42) / k - 20, camX + (W * 0.58) / k + 20];
  }

  // Polyline along a bank offset from the centreline.
  function bankPath(off: number, x0: number, x1: number, reverse = false): void {
    const xs: number[] = [];
    for (let x = x0; x <= x1; x += 2) xs.push(x);
    if (reverse) xs.reverse();
    xs.forEach((x, i) => {
      const px = sx(x);
      const py = sy(cy(x) + off);
      if (i === 0 && !reverse) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
  }

  function drawRiver(): void {
    const k = scale();
    const [x0, x1] = visibleRange();
    ctx.fillStyle = '#7fae5a';
    ctx.fillRect(0, 0, W, H);
    // Towpath on the north bank.
    ctx.strokeStyle = '#cdbf9a';
    ctx.lineWidth = 3.4 * k;
    ctx.beginPath();
    bankPath(-HALF - 3.2, x0, x1);
    ctx.stroke();
    // Water.
    ctx.fillStyle = '#5b8fa8';
    ctx.beginPath();
    bankPath(-HALF, x0, x1);
    bankPath(HALF, x0, x1, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4f7a3a';
    ctx.lineWidth = Math.max(2, 0.5 * k);
    for (const off of [-HALF, HALF]) {
      ctx.beginPath();
      bankPath(off, x0, x1);
      ctx.stroke();
    }
    // Ripples drifting downstream.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    const drift = (performance.now() / 1000) * 0.6;
    for (let i = Math.floor(x0 / 7); i <= x1 / 7; i++) {
      const x = i * 7 + hash(i) * 5 - (drift % 7);
      const y = cy(x) + (hash(i, 1) - 0.5) * (HALF * 1.6);
      ctx.beginPath();
      ctx.moveTo(sx(x), sy(y));
      ctx.lineTo(sx(x + 1.8), sy(y));
      ctx.stroke();
    }
    for (const p of puddles) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (p.life / 3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        sx(p.x),
        sy(p.y),
        (0.6 + (3 - p.life) * 0.25) * k,
        (0.4 + (3 - p.life) * 0.15) * k,
        heading,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  function drawBanks(): void {
    const k = scale();
    const [x0, x1] = visibleRange();
    // Willows on the south bank.
    for (let i = Math.floor(x0 / 9); i <= x1 / 9; i++) {
      if (hash(i, 3) < 0.45) continue;
      const x = i * 9 + hash(i, 4) * 4;
      const px = sx(x);
      const py = sy(cy(x) + HALF + 3 + hash(i, 5) * 5);
      const r = (2.6 + hash(i, 6) * 1.4) * k;
      ctx.fillStyle = '#5f8f35';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8cbf55';
      ctx.lineWidth = 1.5;
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a) * r * 0.3, py + Math.sin(a) * r * 0.3);
        ctx.quadraticCurveTo(
          px + Math.cos(a) * r,
          py + Math.sin(a) * r * 0.6,
          px + Math.cos(a) * r * 1.05,
          py + Math.sin(a) * r + r * 0.25,
        );
        ctx.stroke();
      }
    }
    // Spectators beyond the towpath, crowded at the corners and the finish.
    const crowds = data.stations.filter((s) => s.at > 0).map((s) => s.at);
    for (let i = Math.floor(x0 / 1.6); i <= x1 / 1.6; i++) {
      const x = i * 1.6;
      const near = Math.min(...crowds.map((c) => Math.abs(c - x)));
      const p = near < 30 ? 0.85 : 0.12;
      if (hash(i, 7) > p) continue;
      const px = sx(x + hash(i, 8));
      const py = sy(cy(x) - HALF - 6.2 - hash(i, 9) * 2.5);
      ctx.fillStyle = ['#2c4a8a', '#a3162b', '#e8e0cc', '#3c3c44', '#d1b948'][
        Math.floor(hash(i, 10) * 5)
      ];
      ctx.beginPath();
      ctx.arc(px, py, 0.55 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(px, py - 0.15 * k, 0.28 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    // Station boards on the south bank.
    for (const st of data.stations) {
      const px = sx(st.at);
      if (px < -200 || px > W + 200) continue;
      const top = sy(cy(st.at) + HALF + 1.6);
      const size = Math.max(11, Math.round(k * 0.85));
      ctx.font = `600 ${size}px Georgia, serif`;
      const w = ctx.measureText(st.name).width + size;
      const h = size * 1.7;
      ctx.fillStyle = CREAM;
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2;
      ctx.fillRect(px - w / 2, top, w, h);
      ctx.strokeRect(px - w / 2, top, w, h);
      ctx.fillStyle = RED_DARK;
      ctx.textAlign = 'center';
      ctx.fillText(st.name, px, top + h * 0.7);
    }
    // Finish line across the river.
    const fx = sx(FINISH);
    if (fx > -50 && fx < W + 50) {
      ctx.setLineDash([k * 0.8, k * 0.8]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(fx, sy(cy(FINISH) - HALF));
      ctx.lineTo(fx, sy(cy(FINISH) + HALF));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // The railway bridge deck across the river, drawn over the boats.
  function drawBridge(): void {
    const st = data.stations.find((s) => s.name === 'Railway Bridge');
    if (!st) return;
    const k = scale();
    const x = st.at;
    if (sx(x) < -100 || sx(x) > W + 100) return;
    const a = riverAngle(x) + Math.PI / 2;
    const len = HALF + 8;
    ctx.save();
    ctx.translate(sx(x), sy(cy(x)));
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(70,70,78,0.92)';
    ctx.fillRect(-len * k, -2.6 * k, len * 2 * k, 5.2 * k);
    ctx.strokeStyle = '#2a2a30';
    ctx.lineWidth = 2;
    for (let i = -len; i <= len; i += 2.5) {
      ctx.beginPath();
      ctx.moveTo(i * k, -2.6 * k);
      ctx.lineTo((i + 2.5) * k, 2.6 * k);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a7a66';
    ctx.fillRect(-len * k, -0.9 * k, len * 2 * k, 0.4 * k);
    ctx.fillRect(-len * k, 0.5 * k, len * 2 * k, 0.4 * k);
    ctx.restore();
  }

  // An eight with rowers, oars, cox, and an optional cox face.
  function drawBoat(
    x: number,
    y: number,
    a: number,
    colours: Rival,
    seatT: (i: number) => number,
    face?: HTMLImageElement,
  ): void {
    const k = scale();
    ctx.save();
    ctx.translate(sx(x), sy(y));
    ctx.rotate(a);
    ctx.scale(k, k);
    // Oars under the hull.
    for (let i = 0; i < 8; i++) {
      const { along: al, side } = SEATS[i];
      const t = seatT(i);
      const phi = sweep(t);
      const gx = al;
      const gy = side * (BEAM / 2 + 0.5);
      const tx = gx + Math.sin(phi) * OAR;
      const ty = gy + side * Math.cos(phi) * OAR;
      const hx = gx - Math.sin(phi) * 1.0;
      const hy = gy - side * Math.cos(phi) * 1.0;
      ctx.strokeStyle = '#d8d2c4';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // Rigger.
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(al, side * (BEAM / 2));
      ctx.lineTo(gx, gy);
      ctx.stroke();
      // Blade: square in the drive, feathered on the recovery.
      const drive = t >= 0 && t < DRIVE;
      const bw = drive ? 0.55 : 0.2;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(Math.atan2(ty - gy, tx - gx));
      ctx.fillStyle = colours.blade;
      ctx.fillRect(-0.9, -bw / 2, 1.0, bw);
      ctx.restore();
    }
    // Hull.
    ctx.fillStyle = colours.hull;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(L / 2, 0);
    ctx.quadraticCurveTo(L / 2 - 3, -BEAM / 2, L / 2 - 5, -BEAM / 2);
    ctx.lineTo(-L / 2 + 2.5, -BEAM / 2);
    ctx.quadraticCurveTo(-L / 2 + 0.6, -BEAM / 2, -L / 2, 0);
    ctx.quadraticCurveTo(-L / 2 + 0.6, BEAM / 2, -L / 2 + 2.5, BEAM / 2);
    ctx.lineTo(L / 2 - 5, BEAM / 2);
    ctx.quadraticCurveTo(L / 2 - 3, BEAM / 2, L / 2, 0);
    ctx.fill();
    ctx.stroke();
    // Rowers lean back through the drive.
    for (let i = 0; i < 8; i++) {
      const t = seatT(i);
      const lean =
        t >= 0 && t < DRIVE
          ? -0.35 * Math.sin((Math.PI * t) / (2 * DRIVE))
          : t >= DRIVE
            ? -0.35 * (1 - (t - DRIVE) / (STROKE - DRIVE))
            : 0.15;
      const px = SEATS[i].along - 0.5 + lean;
      ctx.fillStyle = colours.kit;
      ctx.beginPath();
      ctx.ellipse(px, 0, 0.36, 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(px + 0.12, 0, 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cox in the stern.
    const cx = -L / 2 + 1.7;
    ctx.fillStyle = colours.kit;
    ctx.beginPath();
    ctx.ellipse(cx, 0, 0.32, 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    if (face?.complete && face.naturalWidth) {
      ctx.save();
      ctx.translate(cx + 0.1, 0);
      ctx.rotate(-a);
      ctx.beginPath();
      ctx.arc(0, 0, 0.62, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(face, -0.62, -0.62, 1.24, 1.24);
      ctx.restore();
    } else {
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(cx + 0.1, 0, 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCrew(c: Crew): void {
    const p = crewPose(c);
    const moving = c.v > 0.5;
    drawBoat(p.x, p.y, p.a, c.rival, () => (moving ? c.stroke : -1));
  }

  // Bank party cyclists on the towpath alongside my boat.
  function drawBankParty(): void {
    const k = scale();
    const bob = performance.now() / 1000;
    [-3, -8, 2].forEach((off, i) => {
      const x = bx + off + Math.sin(bob * 0.8 + i) * 0.6;
      const px = sx(x);
      const py = sy(cy(x) - HALF - 3.2 + (i - 1) * 0.7);
      const a = riverAngle(x);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 0.18 * k;
      ctx.beginPath();
      ctx.moveTo(-0.9 * k, 0);
      ctx.lineTo(0.9 * k, 0);
      ctx.stroke();
      ctx.fillStyle = i === 0 ? RED : '#2c4a8a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.4 * k, 0.32 * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(0.15 * k, 0, 0.22 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (whistle > 0 && state === 'race' && i === 0) {
        text('!'.repeat(whistle), px, py - 0.8 * k, Math.max(12, k * 0.9), '#fff', 800, 'center');
      }
    });
  }

  // Key caps beside each of my blades.
  function drawCaps(): void {
    const k = scale();
    const cap = Math.max(18, Math.min(30, k * 1.25));
    for (let i = 0; i < 8; i++) {
      const tip = bladeTip(i, 1.6);
      const px = sx(tip.x);
      const py = sy(tip.y);
      const t = strokeT[i];
      const drive = t >= 0 && t < DRIVE;
      ctx.fillStyle = drive ? GOLD : t >= 0 ? 'rgba(244,239,228,0.55)' : 'rgba(244,239,228,0.92)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillRect(px - cap / 2, py - cap / 2, cap, cap);
      ctx.strokeRect(px - cap / 2, py - cap / 2, cap, cap);
      text(keyOf[i], px, py + cap * 0.18, cap * 0.55, INK, 800, 'center');
    }
  }

  function gaps() {
    const me = ends(bx, by, heading);
    const a = crewPose(ahead);
    const c = crewPose(chaser);
    return {
      ahead: (arc(a.stern.x) - arc(me.bow.x)) / L,
      behind: (arc(me.stern.x) - arc(c.bow.x)) / L,
      toGo: Math.max(0, arc(FINISH) - arc(me.bow.x)),
    };
  }

  function drawHud(): void {
    const s = Math.max(12, H * 0.026);
    const g = gaps();
    const fmt = (n: number) => (n <= 0 ? 'overlap!' : `${n.toFixed(1)} lengths`);
    const aheadText = `${ahead.rival.name} ahead: ${fmt(g.ahead)}`;
    const behindText = `${chaser.rival.name} behind: ${fmt(g.behind)}`;
    ctx.font = `700 ${Math.round(s * 0.85)}px system-ui, sans-serif`;
    const panelW = Math.max(
      s * 14,
      ...[aheadText, behindText].map((t) => ctx.measureText(t).width + 30),
    );
    ctx.fillStyle = 'rgba(20,20,30,0.74)';
    ctx.fillRect(12, 12, panelW, s * 6.3);
    text(`${Math.round(g.toGo)} m`, 24, 12 + s * 1.9, s * 1.8, CREAM, 700, 'left', true);
    text('to the Top Finish', 24 + s * 5.2, 12 + s * 1.9, s * 0.75, '#c8c2b4', 500);
    text(aheadText, 24, 12 + s * 3.2, s * 0.85, GOLD, 700);
    text(behindText, 24, 12 + s * 4.4, s * 0.85, CREAM, 600);
    text(place, 24, 12 + s * 5.6, s * 0.8, '#c8c2b4', 600);
    text(fmtTime(time), W - 24, 12 + s * 1.6, s * 1.3, INK, 700, 'right');
    if (best) text(`Best bump ${fmtTime(best)}`, W - 24, 12 + s * 2.8, s * 0.8, INK, 600, 'right');
    text(
      `${Math.abs(speed * 1.94).toFixed(1)} kn`,
      W - 24,
      12 + s * 4.0,
      s * 0.8,
      INK,
      600,
      'right',
    );

    // Seat map: stroke on the left, bow on the right, stroke side on top.
    const cap = Math.max(26, Math.min(40, H * 0.055));
    const span = Math.min(W * 0.6, cap * 12);
    const y0 = H - cap * 2.4 - 12;
    ctx.fillStyle = 'rgba(20,20,30,0.6)';
    ctx.fillRect(W / 2 - span / 2 - cap * 1.6, y0 - cap * 0.4, span + cap * 3.2, cap * 2.8);
    text('stroke side', W / 2 - span / 2 - cap * 1.45, y0 + cap * 0.6, s * 0.65, '#c8c2b4', 600);
    text('bow side', W / 2 - span / 2 - cap * 1.45, y0 + cap * 1.95, s * 0.65, '#c8c2b4', 600);
    for (let i = 0; i < 8; i++) {
      const { along: al, side, seat } = SEATS[i];
      const x = W / 2 + (al / (L / 2)) * (span / 2) + cap * 0.6;
      const y = side < 0 ? y0 : y0 + cap * 1.3;
      const t = strokeT[i];
      ctx.fillStyle =
        t >= 0 && t < DRIVE ? GOLD : t >= 0 ? 'rgba(244,239,228,0.5)' : 'rgba(244,239,228,0.9)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillRect(x - cap / 2, y, cap, cap);
      ctx.strokeRect(x - cap / 2, y, cap, cap);
      text(keyOf[i], x, y + cap * 0.68, cap * 0.5, INK, 800, 'center');
      text(String(seat), x + cap * 0.62, y + cap * 0.35, s * 0.6, '#c8c2b4', 600, 'left');
    }

    if (coxT > 0 && state === 'race') {
      const who = cox ? cox.name.split(' ')[0] : 'Cox';
      ctx.font = `600 ${Math.round(s * 0.9)}px system-ui, sans-serif`;
      const msg = `${who} (cox): ${coxLine}`;
      const w = Math.min(W - 24, ctx.measureText(msg).width + s * 1.4);
      ctx.fillStyle = 'rgba(244,239,228,0.94)';
      ctx.fillRect(W / 2 - w / 2, y0 - cap * 0.4 - s * 2.1, w, s * 1.7);
      text(msg, W / 2, y0 - cap * 0.4 - s * 0.85, s * 0.9, RED_DARK, 600, 'center');
    }
    if (factT > 0 && (state === 'race' || state === 'countdown')) banner(fact, 12 + s * 7);
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

  function drawFlash(): void {
    if (flashT <= 0) return;
    const size = Math.max(22, H * (flash.length > 16 ? 0.045 : 0.09));
    ctx.globalAlpha = Math.min(1, flashT * 2);
    ctx.font = `800 ${Math.round(size)}px Georgia, serif`;
    ctx.lineWidth = Math.max(3, size * 0.12);
    ctx.strokeStyle = RED_DARK;
    ctx.textAlign = 'center';
    ctx.strokeText(flash, W / 2, H * 0.36);
    ctx.fillStyle = GOLD;
    ctx.fillText(flash, W / 2, H * 0.36);
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
    let y = Math.max(12, H * 0.4 - h / 2);
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
    drawRiver();
    drawBanks();
    drawCrew(chaser);
    drawCrew(ahead);
    const me = cox ? faces.get(cox.face) : undefined;
    drawBoat(bx, by, heading, LMBC, (i) => strokeT[i], me);
    drawBridge();
    drawBankParty();
    if (state !== 'prize') drawCaps();
    drawHud();
    drawFlash();
    if (state === 'ready') {
      card([
        { text: data.title, size: 1.6, color: GOLD, serif: true, weight: 700 },
        { text: data.subtitle, size: 0.9, color: CREAM },
        { text: data.controls, size: 0.9, color: CREAM },
        { text: `Today: ${keyOf.join(' ')}`, size: 1, color: CREAM, weight: 700 },
        { text: data.start, size: 1, color: GOLD, weight: 700 },
      ]);
    } else if ((state === 'caught' || state === 'over') && stateT > 0.8) {
      card([
        {
          text: state === 'caught' ? 'Bumped' : 'Rowed over',
          size: 1.8,
          color: GOLD,
          serif: true,
          weight: 700,
        },
        { text: line, size: 1, color: CREAM },
        { text: fact, size: 0.85, color: '#c8c2b4' },
        {
          text: `Time: ${fmtTime(time)}${best ? `. Best bump: ${fmtTime(best)}` : ''}`,
          size: 0.85,
          color: CREAM,
        },
        { text: data.restart, size: 0.95, color: GOLD, weight: 700 },
      ]);
    }
  }

  // ---- Prize: drag willow sprigs onto roster faces ----

  function openPrize(): void {
    state = 'prize';
    stateT = 0;
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(20,20,30,0.55);font-family:system-ui,sans-serif;overflow:auto';
    const panel = document.createElement('div');
    panel.style.cssText = `max-width:720px;width:100%;background:${CREAM};color:${INK};border:4px solid ${GOLD};outline:3px solid ${RED_DARK};padding:18px 20px;text-align:center;box-sizing:border-box`;
    const h = document.createElement('h2');
    h.textContent = data.prizeTitle;
    h.style.cssText = `margin:0 0 6px;font:800 2.4rem Georgia,serif;color:${RED}`;
    const sub = document.createElement('p');
    sub.textContent = `You bumped ${ahead.rival.name} at ${place} in ${fmtTime(time)}. ${line}`;
    sub.style.margin = '0 0 4px';
    const hint = document.createElement('p');
    hint.textContent = data.prizeHint;
    hint.style.cssText = 'margin:0 0 12px;font-weight:700';
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-bottom:12px';
    const targets: { el: HTMLElement; who?: RosterEntry }[] = [];
    const people: (RosterEntry | undefined)[] = roster.length ? roster : [undefined];
    for (const who of people) {
      const cell = document.createElement('div');
      cell.style.cssText = 'width:84px;font-size:0.75rem;line-height:1.2';
      const head = document.createElement('div');
      head.style.cssText = `position:relative;width:72px;height:72px;margin:0 auto 4px;border-radius:50%;border:3px solid ${RED};background:${SKIN};overflow:visible`;
      if (who) {
        const img = document.createElement('img');
        img.src = who.face;
        img.alt = who.name;
        img.draggable = false;
        img.style.cssText =
          'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block';
        head.append(img);
      }
      const name = document.createElement('div');
      name.textContent = who ? who.name : 'Your cox';
      cell.append(head, name);
      row.append(cell);
      targets.push({ el: head, who });
    }
    const tray = document.createElement('div');
    tray.style.cssText =
      'display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px';
    const source = document.createElement('div');
    source.innerHTML = sprigSvg(90);
    source.style.cssText = 'cursor:grab;touch-action:none;user-select:none;padding:4px';
    source.title = 'Drag me';
    const label = document.createElement('span');
    label.textContent = 'Willow sprig (drag)';
    label.style.fontWeight = '600';
    tray.append(source, label);
    const said = document.createElement('p');
    said.setAttribute('aria-live', 'polite');
    said.style.cssText = `min-height:1.3em;margin:4px 0 10px;color:${RED_DARK};font-weight:600`;
    const again = document.createElement('button');
    again.textContent = data.again;
    again.style.cssText = `font:700 1rem system-ui,sans-serif;padding:8px 18px;background:${RED};color:#fff;border:2px solid ${GOLD};cursor:pointer`;
    again.addEventListener('click', () => {
      reset();
      blip();
    });
    panel.append(h, sub, hint, row, tray, said, again);
    el.append(panel);
    root.append(el);
    prize = el;

    let ghost: HTMLElement | undefined;
    const move = (e: PointerEvent) => {
      if (!ghost) return;
      ghost.style.left = `${e.clientX - 22}px`;
      ghost.style.top = `${e.clientY - 70}px`;
    };
    source.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      source.setPointerCapture(e.pointerId);
      ghost = document.createElement('div');
      ghost.innerHTML = sprigSvg(90);
      ghost.style.cssText =
        'position:fixed;pointer-events:none;z-index:10;transform:rotate(-15deg)';
      document.body.append(ghost);
      move(e);
    });
    source.addEventListener('pointermove', move);
    const drop = (e: PointerEvent) => {
      if (!ghost) return;
      ghost.remove();
      ghost = undefined;
      const hit = targets.find(({ el: t }) => {
        const r = t.getBoundingClientRect();
        return (
          e.clientX >= r.left - 10 &&
          e.clientX <= r.right + 10 &&
          e.clientY >= r.top - 30 &&
          e.clientY <= r.bottom + 10
        );
      });
      if (!hit) return;
      const pinned = document.createElement('div');
      pinned.innerHTML = sprigSvg(54);
      const n = hit.el.querySelectorAll('.sprig').length;
      pinned.className = 'sprig';
      pinned.style.cssText = `position:absolute;top:-30px;left:${18 + ((n * 17) % 40)}px;pointer-events:none;transform:rotate(${-30 + Math.random() * 60}deg)`;
      hit.el.append(pinned);
      said.textContent = hit.who
        ? pick(data.prizeLines).replace('{name}', hit.who.name).replace('{role}', hit.who.role)
        : data.prizeNoRoster;
      beep(1320, 90, 'triangle', 0.06);
      beep(1760, 120, 'triangle', 0.05, 90);
    };
    source.addEventListener('pointerup', drop);
    source.addEventListener('pointercancel', () => {
      ghost?.remove();
      ghost = undefined;
    });
  }

  // ---- Loop and input ----

  let raf = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000) * slow;
    last = now;
    update(dt);
    if (state === 'bump' && stateT > 2) openPrize();
    draw();
    raf = requestAnimationFrame(frame);
  }

  function begin(): void {
    state = 'countdown';
    stateT = 0;
    blip();
  }

  function restart(): boolean {
    const done =
      ((state === 'caught' || state === 'over') && stateT > 0.8) ||
      (state === 'prize' && stateT > 0.5);
    if (!done) return false;
    reset();
    blip();
    return true;
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key === 'Escape') return;
    const key = e.key.length === 1 ? e.key.toUpperCase() : '';
    const seat = keyOf.indexOf(key);
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (state === 'ready') begin();
      else restart();
      return;
    }
    if (!key) return;
    e.preventDefault();
    if (state === 'ready') return begin();
    if (e.repeat) return;
    if (seat >= 0) {
      held.add(key);
      catchSeat(seat);
    } else if (state === 'race') beep(70, 60, 'sawtooth', 0.04);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key.length === 1) held.delete(e.key.toUpperCase());
  };
  const onBlur = () => held.clear();
  const onPointer = () => {
    if (state === 'ready') begin();
    else restart();
  };

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
    prize?.remove();
    canvas.remove();
  };
}
