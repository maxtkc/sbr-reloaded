// Pocket Johnians: walk the OSM tilemap, meet the committee, fight whatever lives in the tall grass.
import type { KAPLAYCtx } from 'kaplay';
import { games } from '../../chaos/registry';
import { startKaplay } from '../../chaos/shared/kaplay';
import { beep, blip, fanfare } from '../../chaos/shared/sfx';
import { url } from '../../lib/url';
import { createBattle, type Battle, type Button, type Outcome } from './battle';
import data from './data.json';
import placements from './npcs.json';
import * as world from './world';

type Dir = 'up' | 'down' | 'left' | 'right';

interface RosterEntry {
  slug: string;
  name: string;
  role: string;
  bio: string;
  face: string;
}

interface Npc {
  slug: string;
  name: string;
  role: string;
  bio: string;
  line: string;
  place: string;
  x: number;
  y: number;
  met: boolean;
}

interface Dialogue {
  title?: string;
  face?: string;
  pages: string[];
  then?: () => void;
}

const DIRS: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const KEYS: Record<Dir, string[]> = {
  up: ['up', 'w'],
  down: ['down', 's'],
  left: ['left', 'a'],
  right: ['right', 'd'],
};
const A_KEYS = ['space', 'enter', 'z'];
const B_KEYS = ['x', 'backspace'];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function readRoster(): RosterEntry[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

// Splits text into pages of at most max chars, on sentence then word boundaries.
function paginate(text: string, max: number): string[] {
  const sentences =
    text
      .replace(/\s+/g, ' ')
      .trim()
      .match(/[^.!?]+[.!?]*\s*/g) ?? [];
  const pages: string[] = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) pages.push(cur.trim());
    cur = '';
  };
  for (const s of sentences) {
    if ((cur + s).length <= max) {
      cur += s;
      continue;
    }
    push();
    if (s.length <= max) {
      cur = s;
      continue;
    }
    for (const word of s.split(' ')) {
      if ((cur + word).length > max) push();
      cur += word + ' ';
    }
  }
  push();
  return pages;
}

export default function start(root: HTMLElement): () => void {
  let stop: (() => void) | undefined;
  let stopped = false;
  const pad = createPad(root);
  startKaplay(root, { background: [20, 20, 30], pixelDensity: devicePixelRatio }).then((ctx) => {
    if (stopped) return ctx.stop();
    stop = ctx.stop;
    run(ctx.k, pad);
  });
  return () => {
    stopped = true;
    stop?.();
    pad?.remove();
  };
}

interface Pad {
  held: Dir | null;
  onPress: (b: Button) => void;
  show: (on: boolean) => void;
  remove: () => void;
}

// On-screen d-pad and A/B buttons for coarse pointers.
function createPad(root: HTMLElement): Pad | null {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  const el = document.createElement('div');
  el.className = 'pk-pad';
  const style = document.createElement('style');
  style.textContent = `
.pk-pad{position:absolute;inset:auto 0 0 0;height:0;pointer-events:none}
.pk-pad button{position:absolute;pointer-events:auto;width:52px;height:52px;border:2px solid rgba(255,255,255,.7);
background:rgba(20,20,30,.45);color:#fff;font:700 18px/1 system-ui,sans-serif;border-radius:12px;
touch-action:none;user-select:none;-webkit-user-select:none}
.pk-pad .pk-ab{border-radius:50%;width:58px;height:58px;background:rgba(122,15,31,.6)}
.pk-pad .pk-tri{display:block;margin:auto;width:18px;height:16px;background:#fff;
clip-path:polygon(50% 0,100% 100%,0 100%)}`;
  const pad: Pad = {
    held: null,
    onPress: () => {},
    show: (on) => {
      el.style.display = on ? '' : 'none';
      if (!on) pad.held = null;
    },
    remove: () => el.remove(),
  };
  // Positions: d-pad bottom-left, A/B bottom-right. Direction buttons hold a triangle rotated by the given degrees.
  const spots: [string, string, number | string][] = [
    ['up', 'left:66px;bottom:126px', 0],
    ['left', 'left:12px;bottom:72px', -90],
    ['right', 'left:120px;bottom:72px', 90],
    ['down', 'left:66px;bottom:18px', 180],
    ['a', 'right:16px;bottom:96px', 'A'],
    ['b', 'right:84px;bottom:40px', 'B'],
  ];
  for (const [b, pos, label] of spots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = pos;
    btn.setAttribute('aria-label', b);
    if (typeof label === 'string') {
      btn.textContent = label;
      btn.className = 'pk-ab';
    } else {
      const tri = document.createElement('span');
      tri.className = 'pk-tri';
      tri.style.transform = `rotate(${label}deg)`;
      btn.append(tri);
    }
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      if (b in DIRS) pad.held = b as Dir;
      pad.onPress(b as Button);
    });
    const release = () => {
      if (pad.held === b) pad.held = null;
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    el.append(btn);
  }
  el.append(style);
  root.append(el);
  return pad;
}

function run(k: KAPLAYCtx, pad: Pad | null): void {
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const STEP = 0.16 / slow;
  const GOLD = k.rgb(209, 185, 72);
  const INK = k.rgb(30, 30, 40);
  const WHITE = k.rgb(255, 255, 255);

  const snapAt = (p: { lon: number; lat: number }) => {
    const t = world.fromLonLat(p.lon, p.lat);
    return world.snap(t.x, t.y);
  };
  const roster = new Map(readRoster().map((r) => [r.slug, r]));
  const npcs: Npc[] = [];
  for (const p of placements.npcs) {
    const r = roster.get(p.slug);
    if (!r) continue;
    k.loadSprite(p.slug, r.face);
    const at = snapAt(p);
    npcs.push({ ...r, line: p.line, place: p.place, x: at.x, y: at.y, met: false });
  }
  const portal = snapAt(placements.portal);
  const home = snapAt(placements.start);

  // Map labels, highest priority first; a label that would overlap an earlier one is skipped.
  const LABEL_KINDS = ['court', 'green', 'bridge', 'water', 'street'];
  const rename: Record<string, string> = data.labelRename;
  const buildings: Record<string, string> = data.labelBuildings;
  const labels: { text: string; x: number; y: number }[] = data.labelExtra.map((l) => ({
    text: l.name,
    ...world.fromLonLat(l.lon, l.lat),
  }));
  for (const p of world.places.filter((p) => p.kind === 'building' && buildings[p.name])) {
    labels.push({ text: buildings[p.name], x: p.x, y: p.y });
  }
  for (const kind of LABEL_KINDS) {
    for (const p of world.places.filter((p) => p.kind === kind)) {
      const text = rename[p.name] ?? p.name;
      // Bridges are also mapped as streets: one label per name per area.
      const dup = labels.some((l) => l.text === text && Math.hypot(l.x - p.x, l.y - p.y) < 12);
      if (text && !dup) labels.push({ text, x: p.x, y: p.y });
    }
  }

  const W = () => k.width();
  const H = () => k.height();
  const ts = () => Math.max(16, Math.floor(Math.min(H() / 15, W() / 9)));
  const fsize = () => Math.min(H() * 0.034, W() * 0.042);

  let mode: 'talk' | 'walk' | 'flash' | 'battle' = 'talk';
  let time = 0;
  const player = { x: home.x, y: home.y, fx: home.x, fy: home.y, t: 1, dir: 'down' as Dir };
  let holdT = 0;
  let bumpT = 0;
  let grace = 4;
  let flashT = 0;
  let battle: Battle | null = null;
  let pending: (typeof data.encounters)[number] | null = null;
  let dialogue: Dialogue | null = null;
  let page = 0;
  let typed = 0;
  let area = '';
  let banner = { text: '', t: 0 };
  let hintT = 8;

  function talk(d: Dialogue): void {
    mode = 'talk';
    dialogue = d;
    page = 0;
    typed = 0;
  }

  // Characters that fit one titled dialogue page with a face (monospace glyphs are about 0.6em wide).
  function pageChars(): number {
    const fs = fsize();
    const textW = W() - fs * 2.6 - Math.min(H() * 0.2, W() * 0.22);
    const lines = Math.max(2, Math.floor((H() * 0.26 - fs * 2.6) / (fs * 1.25)));
    return Math.max(40, Math.floor(textW / (fs * 0.62)) * lines);
  }

  // Advances the dialogue, completing the typewriter first.
  function advance(): void {
    if (!dialogue) return;
    const text = dialogue.pages[page] ?? '';
    if (typed < text.length) {
      typed = text.length;
      return;
    }
    page++;
    typed = 0;
    if (page < dialogue.pages.length) return blip();
    const then = dialogue.then;
    dialogue = null;
    mode = 'walk';
    then?.();
  }

  function npcAt(x: number, y: number): Npc | undefined {
    return npcs.find((n) => n.x === x && n.y === y);
  }

  function meet(n: Npc): void {
    blip();
    if (!n.met) {
      n.met = true;
      if (npcs.every((m) => m.met)) fanfare();
    }
    const pages = [
      `Hi! I'm ${n.name}, ${n.role}. You found me at ${n.place}.`,
      ...paginate(n.bio, pageChars()),
      n.line,
    ];
    talk({ title: `${n.name} - ${n.role}`, face: n.slug, pages });
  }

  function enterPortal(): void {
    if (games.minecraft) {
      talk({
        pages: [data.portalOpen],
        then: () => {
          location.href = url('/games/minecraft') + location.search;
        },
      });
    } else {
      beep(180, 300, 'sawtooth', 0.06);
      talk({ pages: data.portalBroken });
    }
  }

  function endBattle(o: Outcome): void {
    battle = null;
    mode = 'walk';
    grace = 8;
    pad?.show(true);
    if (o === 'lose') {
      player.x = player.fx = home.x;
      player.y = player.fy = home.y;
      player.dir = 'down';
      updateArea(true);
    }
  }

  function updateArea(force = false): void {
    const a = world.nearestArea(player.x, player.y);
    if (a && (a.name !== area || force)) {
      area = a.name;
      banner = { text: a.name, t: 2.8 };
    }
  }

  // Arrival on a tile.
  function arrive(): void {
    updateArea();
    if (player.x === portal.x && player.y === portal.y) return enterPortal();
    // Tall grass: anything, 1 in 9. Lawns: a Wild Porter, 1 in 20.
    const t = world.tile(player.x, player.y);
    if (t === ';' || t === ',') {
      if (grace > 0) grace--;
      else if (Math.random() < (t === ';' ? 1 / 9 : 1 / 20)) {
        pending = t === ';' ? pick(data.encounters) : data.encounters[0];
        mode = 'flash';
        flashT = 0;
        beep(880, 80, 'square', 0.06);
        beep(660, 80, 'square', 0.06, 100);
        beep(440, 160, 'square', 0.06, 200);
      }
    }
  }

  function heldDir(): Dir | null {
    if (pad?.held) return pad.held;
    for (const d of Object.keys(KEYS) as Dir[])
      if (KEYS[d].some((key) => k.isKeyDown(key))) return d;
    return null;
  }

  function press(b: Button): void {
    if (mode === 'battle') return battle?.press(b);
    if (mode === 'talk') {
      if (b === 'a' || b === 'b') advance();
      return;
    }
    if (mode === 'walk' && b === 'a' && player.t >= 1) {
      const [dx, dy] = DIRS[player.dir];
      const n = npcAt(player.x + dx, player.y + dy);
      if (n) meet(n);
    }
  }
  if (pad) pad.onPress = press;

  for (const key of A_KEYS) k.onKeyPress(key, () => press('a'));
  for (const key of B_KEYS) k.onKeyPress(key, () => press('b'));
  for (const d of Object.keys(KEYS) as Dir[]) {
    for (const key of KEYS[d]) k.onKeyPress(key, () => mode === 'battle' && press(d));
  }
  k.onMousePress(() => {
    const m = k.mousePos();
    if (mode === 'battle') battle?.click(m.x, m.y);
    else if (mode === 'talk') advance();
  });

  talk({
    title: 'Pocket Johnians',
    pages: [...data.intro, pad ? data.touchControls : data.controls],
  });
  updateArea(true);

  k.onUpdate(() => {
    const dt = Math.min(k.dt(), 1 / 20);
    time += dt;
    banner.t -= dt;
    bumpT -= dt;
    if (mode !== 'talk') hintT -= dt;
    if (mode === 'talk' && dialogue) {
      typed = Math.min((dialogue.pages[page] ?? '').length, typed + dt * 55);
    }
    if (mode === 'flash') {
      flashT += dt;
      if (flashT > 0.9 && pending) {
        mode = 'battle';
        battle = createBattle(k, pending, endBattle);
        pending = null;
        pad?.show(false);
      }
      return;
    }
    if (mode === 'battle') return battle?.update(dt);

    if (player.t < 1) {
      player.t = Math.min(1, player.t + dt / STEP);
      if (player.t >= 1) {
        player.fx = player.x;
        player.fy = player.y;
        arrive();
      }
    }
    if (mode !== 'walk' || player.t < 1) return;
    const d = heldDir();
    if (!d) {
      holdT = 0;
      return;
    }
    holdT += dt;
    // A short tap on a new direction only turns.
    if (d !== player.dir && holdT < 0.09) {
      player.dir = d;
      return;
    }
    player.dir = d;
    const [dx, dy] = DIRS[d];
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (world.walkable(nx, ny) && !npcAt(nx, ny)) {
      player.fx = player.x;
      player.fy = player.y;
      player.x = nx;
      player.y = ny;
      player.t = 0;
    } else if (bumpT <= 0) {
      beep(110, 80, 'square', 0.05);
      bumpT = 0.3;
    }
  });

  // Pixel position of the player (tweened), used for the camera.
  function playerPos(): [number, number] {
    const e = player.t;
    return [player.fx + (player.x - player.fx) * e, player.fy + (player.y - player.fy) * e];
  }

  function drawTile(t: world.Tile, sx: number, sy: number, s: number, x: number, y: number): void {
    const v = (x * 7 + y * 13) % 3;
    switch (t) {
      case '.':
        k.drawRect({
          pos: k.vec2(sx, sy),
          width: s,
          height: s,
          color: k.rgb(206 - v * 4, 196 - v * 4, 168 - v * 4),
        });
        break;
      case ',':
        k.drawRect({
          pos: k.vec2(sx, sy),
          width: s,
          height: s,
          color: k.rgb(112 + v * 6, 184, 92),
        });
        break;
      case ';': {
        k.drawRect({ pos: k.vec2(sx, sy), width: s, height: s, color: k.rgb(64, 150, 64) });
        for (const ox of [0.1, 0.55]) {
          k.drawTriangle({
            p1: k.vec2(sx + s * ox, sy + s * 0.9),
            p2: k.vec2(sx + s * (ox + 0.35), sy + s * 0.9),
            p3: k.vec2(sx + s * (ox + 0.17), sy + s * 0.35),
            color: k.rgb(36, 110, 40),
          });
        }
        break;
      }
      case '~': {
        k.drawRect({ pos: k.vec2(sx, sy), width: s, height: s, color: k.rgb(70, 130, 205) });
        const wy = sy + s * (0.4 + 0.15 * Math.sin(time * 2 + x * 0.7 + y));
        k.drawRect({
          pos: k.vec2(sx + s * 0.2, wy),
          width: s * 0.4,
          height: Math.max(1, s * 0.06),
          color: k.rgb(150, 190, 235),
        });
        break;
      }
      case '=':
        k.drawRect({ pos: k.vec2(sx, sy), width: s, height: s, color: k.rgb(118, 118, 124) });
        break;
      case '#':
      case 'D': {
        // Roof on top; the front face shows where the tile below is open.
        const front = world.tile(x, y + 1) !== '#' && world.tile(x, y + 1) !== 'D';
        k.drawRect({ pos: k.vec2(sx, sy), width: s, height: s, color: k.rgb(150 - v * 5, 80, 66) });
        if (front) {
          k.drawRect({
            pos: k.vec2(sx, sy + s * 0.45),
            width: s,
            height: s * 0.55,
            color: k.rgb(214, 196, 150),
          });
          k.drawRect({
            pos: k.vec2(sx + s * 0.3, sy + s * 0.58),
            width: s * 0.4,
            height: s * 0.28,
            color: k.rgb(60, 80, 120),
          });
        }
        break;
      }
      case 'T':
        // Grass under the tree; the canopy is drawn with the sprites (drawTree).
        k.drawRect({
          pos: k.vec2(sx, sy),
          width: s,
          height: s,
          color: k.rgb(112 + v * 6, 184, 92),
        });
        break;
      case 'P': {
        // Mown stripes, white touchline where the pitch meets anything else.
        k.drawRect({
          pos: k.vec2(sx, sy),
          width: s,
          height: s,
          color: x % 2 ? k.rgb(128, 196, 100) : k.rgb(116, 186, 90),
        });
        const lw = Math.max(1, s * 0.08);
        const line = (px: number, py: number, w: number, h: number) =>
          k.drawRect({ pos: k.vec2(px, py), width: w, height: h, color: k.rgb(245, 245, 235) });
        if (world.tile(x, y - 1) !== 'P') line(sx, sy, s, lw);
        if (world.tile(x, y + 1) !== 'P') line(sx, sy + s - lw, s, lw);
        if (world.tile(x - 1, y) !== 'P') line(sx, sy, lw, s);
        if (world.tile(x + 1, y) !== 'P') line(sx + s - lw, sy, lw, s);
        break;
      }
    }
  }

  // Tree canopy, overlapping the tile above for depth.
  function drawTree(sx: number, sy: number, s: number, x: number, y: number): void {
    const cx = sx + s / 2;
    const v = ((x * 7 + y * 13) % 3) * 6;
    k.drawEllipse({
      pos: k.vec2(cx, sy + s * 0.9),
      radiusX: s * 0.4,
      radiusY: s * 0.1,
      color: k.rgb(0, 0, 0),
      opacity: 0.25,
    });
    k.drawRect({
      pos: k.vec2(cx - s * 0.08, sy + s * 0.45),
      width: s * 0.16,
      height: s * 0.45,
      color: k.rgb(100, 70, 45),
    });
    k.drawCircle({
      pos: k.vec2(cx, sy + s * 0.15),
      radius: s * 0.52,
      color: k.rgb(34 + v, 100 + v, 48),
    });
    k.drawCircle({
      pos: k.vec2(cx - s * 0.15, sy),
      radius: s * 0.22,
      color: k.rgb(70 + v, 140 + v, 70),
    });
  }

  function drawPerson(cx: number, cy: number, s: number, dir: Dir, walking: boolean): void {
    const step = walking ? Math.sin(time * 18) * s * 0.06 : 0;
    k.drawEllipse({
      pos: k.vec2(cx, cy + s * 0.42),
      radiusX: s * 0.3,
      radiusY: s * 0.08,
      color: k.rgb(0, 0, 0),
      opacity: 0.25,
    });
    k.drawRect({
      pos: k.vec2(cx - s * 0.18, cy + s * 0.2 + step),
      width: s * 0.14,
      height: s * 0.2,
      color: k.rgb(40, 50, 90),
    });
    k.drawRect({
      pos: k.vec2(cx + s * 0.04, cy + s * 0.2 - step),
      width: s * 0.14,
      height: s * 0.2,
      color: k.rgb(40, 50, 90),
    });
    k.drawRect({
      pos: k.vec2(cx - s * 0.25, cy - s * 0.1),
      width: s * 0.5,
      height: s * 0.38,
      radius: s * 0.08,
      color: k.rgb(170, 20, 40),
    });
    k.drawRect({
      pos: k.vec2(cx - s * 0.2, cy - s * 0.12),
      width: s * 0.4,
      height: s * 0.08,
      color: GOLD,
    });
    k.drawCircle({ pos: k.vec2(cx, cy - s * 0.25), radius: s * 0.2, color: k.rgb(240, 200, 165) });
    k.drawCircle({
      pos: k.vec2(cx, cy - s * (dir === 'up' ? 0.27 : 0.33)),
      radius: s * (dir === 'up' ? 0.2 : 0.15),
      color: k.rgb(90, 60, 40),
    });
    const eye = (ex: number) =>
      k.drawCircle({ pos: k.vec2(cx + s * ex, cy - s * 0.22), radius: s * 0.03, color: INK });
    if (dir === 'down') {
      eye(-0.07);
      eye(0.07);
    } else if (dir === 'left') eye(-0.1);
    else if (dir === 'right') eye(0.1);
  }

  function drawNpc(n: Npc, sx: number, sy: number, s: number): void {
    const cx = sx + s / 2;
    const cy = sy + s / 2;
    k.drawEllipse({
      pos: k.vec2(cx, cy + s * 0.42),
      radiusX: s * 0.3,
      radiusY: s * 0.08,
      color: k.rgb(0, 0, 0),
      opacity: 0.25,
    });
    k.drawRect({
      pos: k.vec2(cx - s * 0.25, cy - s * 0.05),
      width: s * 0.5,
      height: s * 0.45,
      radius: s * 0.08,
      color: k.rgb(40, 60, 120),
    });
    k.drawCircle({ pos: k.vec2(cx, cy - s * 0.22), radius: s * 0.32, color: GOLD });
    k.drawSprite({
      sprite: n.slug,
      pos: k.vec2(cx, cy - s * 0.22),
      width: s * 0.58,
      height: s * 0.58,
      anchor: 'center',
    });
    if (!n.met) {
      const by = cy - s * (0.75 + 0.06 * Math.sin(time * 5));
      k.drawText({ text: '!', pos: k.vec2(cx, by), size: s * 0.4, anchor: 'center', color: GOLD });
    }
  }

  function drawPortal(sx: number, sy: number, s: number): void {
    const cx = sx + s / 2;
    const cy = sy + s / 2;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    k.drawCircle({
      pos: k.vec2(cx, cy),
      radius: s * (0.55 + pulse * 0.15),
      color: k.rgb(170, 90, 255),
      opacity: 0.3,
    });
    k.drawRect({
      pos: k.vec2(cx, cy),
      width: s * 0.7,
      height: s * 0.9,
      anchor: 'center',
      color: k.rgb(110, 40, 200),
      outline: { width: Math.max(2, s * 0.08), color: k.rgb(30, 20, 40) },
    });
    for (let i = 0; i < 4; i++) {
      const a = time * 2 + (i * Math.PI) / 2;
      k.drawCircle({
        pos: k.vec2(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.3),
        radius: s * 0.06,
        color: GOLD,
      });
    }
  }

  function drawWorld(): void {
    const s = ts();
    const [px, py] = playerPos();
    const camX = (px + 0.5) * s - W() / 2;
    const camY = (py + 0.5) * s - H() / 2;
    const x0 = Math.floor(camX / s) - 1;
    const y0 = Math.floor(camY / s) - 1;
    const x1 = x0 + Math.ceil(W() / s) + 2;
    const y1 = y0 + Math.ceil(H() / s) + 2;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const sx = Math.floor(x * s - camX);
        const sy = Math.floor(y * s - camY);
        if (x < 0 || y < 0 || x >= world.W || y >= world.H) {
          k.drawRect({ pos: k.vec2(sx, sy), width: s, height: s, color: k.rgb(20, 20, 30) });
        } else drawTile(world.tile(x, y), sx, sy, s + 1, x, y);
      }
    }
    if (portal.x >= x0 && portal.x <= x1 && portal.y >= y0 && portal.y <= y1) {
      drawPortal(portal.x * s - camX, portal.y * s - camY, s);
    }
    // Draw top to bottom so lower sprites overlap upper ones.
    const things: { y: number; draw: () => void }[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (world.tile(x, y) !== 'T') continue;
        things.push({
          y,
          draw: () => drawTree(Math.floor(x * s - camX), Math.floor(y * s - camY), s, x, y),
        });
      }
    }
    for (const n of npcs) {
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
      things.push({ y: n.y, draw: () => drawNpc(n, n.x * s - camX, n.y * s - camY, s) });
    }
    things.push({
      y: py,
      draw: () => drawPerson(W() / 2, H() / 2, s, player.dir, player.t < 1),
    });
    things.sort((a, b) => a.y - b.y).forEach((t) => t.draw());
    // Tall grass covers the player's legs.
    if (world.tile(player.x, player.y) === ';' && player.t >= 1) {
      const sx = W() / 2 - s / 2;
      const sy = H() / 2 + s * 0.15;
      k.drawRect({ pos: k.vec2(sx, sy), width: s, height: s * 0.35, color: k.rgb(64, 150, 64) });
      for (const ox of [0.05, 0.35, 0.65]) {
        k.drawTriangle({
          p1: k.vec2(sx + s * ox, sy + s * 0.35),
          p2: k.vec2(sx + s * (ox + 0.3), sy + s * 0.35),
          p3: k.vec2(sx + s * (ox + 0.15), sy - s * 0.05),
          color: k.rgb(36, 110, 40),
        });
      }
    }
  }

  const widths = new Map<string, number>();
  function drawLabels(): void {
    const s = ts();
    const [px, py] = playerPos();
    const camX = (px + 0.5) * s - W() / 2;
    const camY = (py + 0.5) * s - H() / 2;
    const size = Math.max(11, s * 0.34);
    // The player's tile is reserved so labels never cover them.
    const placed = [{ x0: W() / 2 - s, y0: H() / 2 - s, x1: W() / 2 + s, y1: H() / 2 + s }];
    for (const l of labels) {
      const cx = (l.x + 0.5) * s - camX;
      const cy = (l.y + 0.5) * s - camY;
      if (cx < -W() / 2 || cx > W() * 1.5 || cy < -s || cy > H() + s) continue;
      const key = `${size}|${l.text}`;
      let tw = widths.get(key);
      if (tw === undefined) {
        tw = k.formatText({ text: l.text, size }).width;
        widths.set(key, tw);
      }
      const r = {
        x0: cx - tw / 2 - size * 0.4,
        y0: cy - size * 0.75,
        x1: cx + tw / 2 + size * 0.4,
        y1: cy + size * 0.75,
      };
      if (r.x1 < 0 || r.x0 > W()) continue;
      if (placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
      placed.push(r);
      k.drawRect({
        pos: k.vec2(r.x0, r.y0),
        width: r.x1 - r.x0,
        height: r.y1 - r.y0,
        radius: size * 0.4,
        color: k.rgb(248, 246, 232),
        opacity: 0.85,
        outline: { width: 1, color: INK },
      });
      k.drawText({ text: l.text, pos: k.vec2(cx, cy), size, anchor: 'center', color: INK });
    }
  }

  function drawHud(): void {
    const fs = fsize();
    const met = npcs.filter((n) => n.met).length;
    const label = `Committee met: ${met}/${npcs.length}`;
    k.drawRect({
      pos: k.vec2(W() - fs * 0.5, fs * 0.5),
      width: fs * 11,
      height: fs * 1.6,
      anchor: 'topright',
      color: INK,
      opacity: 0.7,
      radius: 6,
    });
    k.drawText({
      text: label,
      pos: k.vec2(W() - fs, fs * 0.9),
      size: fs * 0.75,
      anchor: 'topright',
      color: met === npcs.length ? GOLD : WHITE,
    });
    k.drawText({
      text: world.attribution,
      pos: k.vec2(fs * 0.4, H() - fs * 0.3),
      size: fs * 0.5,
      anchor: 'botleft',
      color: WHITE,
      opacity: 0.8,
    });
    if (hintT > 0 && !pad) {
      k.drawText({
        text: data.controls,
        pos: k.vec2(W() / 2, H() - fs * 0.3),
        size: fs * 0.6,
        anchor: 'bot',
        color: WHITE,
        opacity: Math.min(1, hintT),
      });
    }
    if (banner.t > 0) {
      const slide = Math.min(1, banner.t * 3, (2.8 - banner.t) * 4);
      const bw = Math.min(W() * 0.7, fs * 0.6 * banner.text.length + fs * 2);
      const bx = -bw + slide * (bw + fs * 0.5);
      k.drawRect({
        pos: k.vec2(bx, fs * 0.5),
        width: bw,
        height: fs * 2,
        color: k.rgb(248, 246, 232),
        outline: { width: 3, color: k.rgb(122, 15, 31) },
        radius: 6,
      });
      k.drawText({
        text: banner.text,
        pos: k.vec2(bx + bw / 2, fs * 1.5),
        size: fs * 0.85,
        width: bw - fs,
        align: 'center',
        anchor: 'center',
        color: INK,
      });
    }
  }

  function drawDialogue(): void {
    if (!dialogue) return;
    const fs = fsize();
    const bh = H() * 0.26;
    const faceW = dialogue.face ? Math.min(H() * 0.2, W() * 0.22) : 0;
    // On touch screens the box sits at the top, clear of the pad.
    const y = pad ? fs * 2.6 : H() - bh - fs * 0.3;
    k.drawRect({
      pos: k.vec2(fs * 0.3, y),
      width: W() - fs * 0.6,
      height: bh,
      color: k.rgb(248, 246, 232),
      outline: { width: 4, color: k.rgb(122, 15, 31) },
      radius: 10,
    });
    let tx = fs * 1.1;
    if (dialogue.face) {
      k.drawCircle({
        pos: k.vec2(fs * 0.9 + faceW / 2, y + bh / 2),
        radius: faceW * 0.46,
        color: GOLD,
      });
      k.drawSprite({
        sprite: dialogue.face,
        pos: k.vec2(fs * 0.9 + faceW / 2, y + bh / 2),
        width: faceW * 0.86,
        height: faceW * 0.86,
        anchor: 'center',
      });
      tx += faceW + fs * 0.3;
    }
    let ty = y + fs * 0.7;
    if (dialogue.title) {
      k.drawText({
        text: dialogue.title,
        pos: k.vec2(tx, ty),
        size: fs * 0.8,
        color: k.rgb(122, 15, 31),
      });
      ty += fs * 1.2;
    }
    const text = dialogue.pages[page] ?? '';
    k.drawText({
      text: text.slice(0, Math.floor(typed)),
      pos: k.vec2(tx, ty),
      size: fs,
      width: W() - tx - fs * 1.2,
      color: INK,
      lineSpacing: fs * 0.25,
    });
    if (typed >= text.length && Math.floor(time * 3) % 2 === 0) {
      const ax = W() - fs * 1.2;
      const ay = y + bh - fs * 0.7;
      k.drawTriangle({
        p1: k.vec2(ax - fs * 0.6, ay - fs * 0.4),
        p2: k.vec2(ax, ay - fs * 0.4),
        p3: k.vec2(ax - fs * 0.3, ay),
        color: k.rgb(122, 15, 31),
      });
    }
  }

  k.onDraw(() => {
    if (mode === 'battle' && battle) return battle.draw();
    drawWorld();
    drawLabels();
    drawHud();
    if (mode === 'talk') drawDialogue();
    if (mode === 'flash') {
      const on = Math.floor(flashT * 8) % 2 === 0;
      k.drawRect({
        pos: k.vec2(0, 0),
        width: W(),
        height: H(),
        color: on ? INK : WHITE,
        opacity: Math.min(1, flashT * 1.5),
      });
    }
  });
}
