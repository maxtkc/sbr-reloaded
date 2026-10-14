// Johncraft: first-person voxel St John's from OSM, with far too many creepers and the committee as zombies.
import * as THREE from 'three';
import { beep, boom } from '../../chaos/shared/sfx';
import { JUMP, makeBody, rayBox, step } from './body';
import data from './data.json';
import {
  disposeMob,
  label,
  makeCreeper,
  makeZombie,
  updateMob,
  type Member,
  type Mob,
} from './mobs';
import { ATTRIBUTION, B, COLOR_OF, GROUND, SX, SZ, World } from './world';

const HOTBAR = [B.PLANKS, B.STONE, B.DIRT, B.GRASS, B.LEAVES, B.TNT];
const LISTED = new Set<number>([B.STONE, B.ROOF, B.DOOR]);
const BILL_PER_BLOCK = 4500;
const MAX_HP = 20;
const CREEPERS = 32;
const REACH = 6;
const EYE = 1.62;
const BLAST = 4;
const MAX_PARTICLES = 300;

const CSS = `
.mc{position:absolute;inset:0;overflow:hidden;user-select:none;font:14px/1.3 system-ui,sans-serif;color:#fff}
.mc canvas{display:block;width:100%;height:100%}
.mc .cross{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;pointer-events:none}
.mc .cross:before,.mc .cross:after{content:"";position:absolute;background:rgba(255,255,255,.85);mix-blend-mode:difference}
.mc .cross:before{left:8px;top:0;width:2px;height:18px}.mc .cross:after{top:8px;left:0;height:2px;width:18px}
.mc .hud{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.mc .hp{display:flex;gap:3px}.mc .hp i{width:14px;height:12px;background:#3a0d0d;border:1px solid #000}
.mc .hp i.on{background:#e02020}.mc .hp i.half{background:linear-gradient(90deg,#e02020 50%,#3a0d0d 50%)}
.mc .bar{display:flex;gap:4px;background:rgba(0,0,0,.45);padding:4px;border:2px solid #222}
.mc .bar div{position:relative;width:38px;height:38px;border:2px solid #555}
.mc .bar div.sel{border-color:#fff}
.mc .bar b{position:absolute;inset:6px;border:1px solid rgba(0,0,0,.4)}
.mc .bar span{position:absolute;left:2px;top:0;font-size:11px;text-shadow:1px 1px #000}
.mc .item{min-height:1.2em;text-shadow:1px 1px #000}
.mc .info{position:absolute;left:8px;top:8px;text-shadow:1px 1px #000;pointer-events:none;max-width:60%}
.mc .info .area{font-weight:700;font-size:16px}
.mc .bill{color:#ffd65a}
.mc .log{position:absolute;left:8px;bottom:110px;max-width:min(36rem,80%);pointer-events:none;display:flex;flex-direction:column;gap:2px}
.mc .log p{margin:0;padding:2px 6px;background:rgba(0,0,0,.5);transition:opacity 1s}
.mc .attrib{position:absolute;right:6px;bottom:4px;font-size:11px;opacity:.75;pointer-events:none}
.mc .ouch{position:absolute;inset:0;background:rgba(255,0,0,.35);opacity:0;pointer-events:none;transition:opacity .3s}
.mc .panel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,10,20,.62);cursor:pointer}
.mc .panel>div{max-width:34rem;margin:1rem;padding:1.2rem 1.4rem;background:#2b2b33;border:3px solid #111;box-shadow:inset 0 0 0 2px #6b6b75}
.mc .panel h2{margin:0 0 .5rem;font:700 1.8rem/1.1 Georgia,serif;color:#d1b948}
.mc .panel p{margin:.4rem 0}
.mc .panel table{border-collapse:collapse;margin:.6rem 0;font-size:13px}
.mc .panel td{padding:1px 10px 1px 0}.mc .panel td:first-child{color:#d1b948;white-space:nowrap}
.mc .panel .go{display:inline-block;margin-top:.6rem;padding:.4rem 1rem;background:#7a0f1f;border:2px solid #d1b948;font-weight:700}
.mc .panel .fact{font-style:italic;color:#ccc}
.mc .panel .small{font-size:12px;opacity:.75}
`;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const fill = (s: string, m?: Member) =>
  s.replace('{name}', m?.name ?? 'Nobody').replace('{role}', m?.role ?? 'Ex officio');

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.append(e);
  return e;
}

function readRoster(): Member[] {
  try {
    return JSON.parse(document.getElementById('roster-data')?.textContent ?? '[]');
  } catch {
    return [];
  }
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

export default function start(root: HTMLElement): () => void {
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.7 : 1;
  const style = document.createElement('style');
  style.textContent = CSS;
  const wrap = el('div', 'mc', root);
  wrap.append(style);

  // Renderer, scene, lights.
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  wrap.append(renderer.domElement);
  const scene = new THREE.Scene();
  const sky = new THREE.Color(0x8fc4ff);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 45, 150);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 400);
  camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x6a5a40, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.4, 1, 0.25);
  scene.add(sun);

  const world = new World();
  scene.add(world.group);
  const signs = new THREE.Group();
  scene.add(signs);
  for (const s of world.signs) {
    const sprite =
      s.kind === 'building' || s.kind === 'court'
        ? label(s.text, 0.9, 'rgba(155,112,62,0.92)', '#2a1a08')
        : label(s.text, 0.7, 'rgba(0,0,0,0.5)', '#ffffff');
    sprite.position.set(s.x, s.y, s.z);
    signs.add(sprite);
  }
  const sbr = label(data.sbrSign, 0.55, 'rgba(122,15,31,0.95)', '#f4e3a1');
  // Floats a few blocks ahead of the spawn view (initial yaw faces -x).
  sbr.position.copy(world.spawn).add(new THREE.Vector3(-8, 3, 0));
  const sbr2 = label(data.sbrSign2, 0.35, 'rgba(0,0,0,0.6)', '#ffffff');
  sbr2.position.copy(world.spawn).add(new THREE.Vector3(-8, 2.5, 0));
  signs.add(sbr, sbr2);

  // Target block outline.
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    new THREE.LineBasicMaterial({ color: 0x000000 }),
  );
  outline.visible = false;
  scene.add(outline);

  // HUD.
  el('div', 'cross', wrap);
  const ouch = el('div', 'ouch', wrap);
  const info = el('div', 'info', wrap);
  const area = el('div', 'area', info);
  const coords = el('div', '', info);
  const bill = el('div', 'bill', info);
  const log = el('div', 'log', wrap);
  const hud = el('div', 'hud', wrap);
  const itemName = el('div', 'item', hud);
  const hpRow = el('div', 'hp', hud);
  const hearts = Array.from({ length: MAX_HP / 2 }, () => el('i', '', hpRow));
  const bar = el('div', 'bar', hud);
  const slots = HOTBAR.map((b, i) => {
    const s = el('div', '', bar);
    el('b', '', s).style.background = `#${COLOR_OF[b].toString(16).padStart(6, '0')}`;
    el('span', '', s, String(i + 1));
    return s;
  });
  el('div', 'attrib', wrap, `Map data ${ATTRIBUTION}`);
  const panel = el('div', 'panel', wrap);
  const card = el('div', '', panel);

  // State.
  const player = makeBody(world.spawn);
  let yaw = Math.PI / 2;
  let pitch = -0.1;
  let hp = MAX_HP;
  let sinceHurt = 99;
  let selected = 0;
  let state: 'play' | 'dead' = 'play';
  let paused = true;
  let started = false;
  let dragLook = false;
  let unlockedAt = 0;
  let damage = 0;
  // Porter notes at 1, 4, 16... times the first block's damage, at most one per 4 s.
  let nextNote = BILL_PER_BLOCK;
  let notesSent = 0;
  let lastNote = -Infinity;
  let shake = 0;
  const stats = { blocks: 0, creepers: 0, zombies: 0 };
  const keys = new Set<string>();
  const mobs: Mob[] = [];
  const particles: Particle[] = [];
  const fuses: { x: number; y: number; z: number; t: number }[] = [];
  const respawns: { member?: Member; t: number }[] = [];
  const timers: number[] = [];
  const roster = readRoster();
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function say(text: string): void {
    const p = el('p', '', log, text);
    while (log.children.length > 5) log.firstElementChild!.remove();
    timers.push(
      window.setTimeout(() => (p.style.opacity = '0'), 6000),
      window.setTimeout(() => p.remove(), 7000),
    );
  }

  function showPanel(kind: 'menu' | 'paused' | 'dead', cause = ''): void {
    card.replaceChildren();
    panel.style.display = '';
    if (kind === 'dead') {
      el('h2', '', card, 'You died!');
      el('p', '', card, cause);
      el(
        'p',
        'small',
        card,
        `Blocks broken: ${stats.blocks}. Creepers detonated: ${stats.creepers}. Committee zombies retired: ${stats.zombies}.`,
      );
      el('p', 'fact', card, pick(data.facts));
      el('span', 'go', card, data.respawn);
      return;
    }
    el('h2', '', card, data.title);
    if (kind === 'menu') {
      el('p', '', card, data.intro);
      const t = el('table', '', card);
      for (const [k, v] of data.controls) {
        const tr = el('tr', '', t);
        el('td', '', tr, k);
        el('td', '', tr, v);
      }
    }
    el('p', 'fact', card, pick(data.facts));
    if (dragLook) el('p', 'small', card, data.noLock);
    el('span', 'go', card, kind === 'menu' ? data.start : data.resume);
  }

  function lock(): void {
    try {
      const r = renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => onLockError());
    } catch {
      onLockError();
    }
  }
  // Without pointer lock the game still runs, with drag-to-look.
  function onLockError(): void {
    dragLook = true;
    resume();
  }
  function resume(): void {
    panel.style.display = 'none';
    paused = false;
    if (!started) data.welcome.forEach(say);
    started = true;
  }
  function onLockChange(): void {
    if (document.pointerLockElement === renderer.domElement) {
      dragLook = false;
      resume();
      return;
    }
    unlockedAt = performance.now();
    keys.clear();
    if (state === 'play' && !paused) {
      paused = true;
      showPanel('paused');
    }
  }
  panel.addEventListener('click', () => {
    if (state === 'dead') respawn();
    if (dragLook) resume();
    else lock();
  });

  function setHp(v: number): void {
    hp = Math.max(0, Math.min(MAX_HP, v));
    hearts.forEach((h, i) => {
      h.className = hp >= i * 2 + 2 ? 'on' : hp === i * 2 + 1 ? 'half' : '';
    });
  }

  function hurt(amount: number, cause: string): void {
    if (state !== 'play' || paused) return;
    setHp(hp - amount);
    sinceHurt = 0;
    ouch.style.transition = 'none';
    ouch.style.opacity = '1';
    requestAnimationFrame(() => {
      ouch.style.transition = '';
      ouch.style.opacity = '0';
    });
    beep(180, 120, 'sawtooth', 0.12);
    if (hp <= 0) die(cause);
  }

  function die(cause: string): void {
    state = 'dead';
    paused = true;
    showPanel('dead', cause);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function respawn(): void {
    player.pos.copy(world.spawn);
    player.vel.set(0, 0, 0);
    yaw = Math.PI / 2;
    pitch = -0.1;
    setHp(MAX_HP);
    state = 'play';
    // Clear the welcome committee.
    for (const m of mobs) {
      if (m.dead || m.body.pos.distanceTo(player.pos) > 14) continue;
      m.dead = true;
      if (m.kind === 'zombie') respawns.push({ member: m.member, t: 5 });
    }
  }

  function selectSlot(i: number): void {
    selected = (i + HOTBAR.length) % HOTBAR.length;
    slots.forEach((s, j) => s.classList.toggle('sel', j === selected));
    itemName.textContent = data.blocks[selected];
  }

  // Mobs.
  function randomSpawn(minDist: number, maxDist: number): THREE.Vector3 | null {
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = minDist + Math.random() * (maxDist - minDist);
      const x = Math.floor(player.pos.x + Math.cos(a) * r);
      const z = Math.floor(player.pos.z + Math.sin(a) * r);
      if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) continue;
      const top = world.top(x, z);
      const b = world.get(x, top, z);
      if (top < 0 || b === B.LEAVES || b === B.WATER) continue;
      if (world.get(x, top + 1, z) || world.get(x, top + 2, z)) continue;
      return new THREE.Vector3(x + 0.5, top + 1, z + 0.5);
    }
    return null;
  }
  function addMob(m: Mob): void {
    mobs.push(m);
    scene.add(m.mesh);
  }
  function spawnZombie(member?: Member): boolean {
    const p = randomSpawn(18, 60);
    if (!p) return false;
    addMob(makeZombie(p, member));
    return true;
  }

  function particle(pos: THREE.Vector3, color: number, speed: number): void {
    if (particles.length >= MAX_PARTICLES) return;
    const mesh = new THREE.Mesh(particleGeom, particleMat(color));
    mesh.position.copy(pos);
    scene.add(mesh);
    particles.push({
      mesh,
      vel: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.3, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.5 + Math.random()) * slow),
      life: 0.8 + Math.random() * 0.8,
    });
  }
  const particleGeom = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  const particleMats = new Map<number, THREE.MeshLambertMaterial>();
  const particleMat = (c: number) => {
    let m = particleMats.get(c);
    if (!m) particleMats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
    return m;
  };

  function breakBlock(x: number, y: number, z: number): void {
    const b = world.get(x, y, z);
    if (b === B.AIR || b === B.WATER || b === B.BEDROCK) return;
    world.set(x, y, z, B.AIR);
    stats.blocks++;
    if (LISTED.has(b)) {
      damage += BILL_PER_BLOCK;
      if (damage >= nextNote && performance.now() - lastNote > 4000) {
        while (damage >= nextNote) nextNote *= 4;
        lastNote = performance.now();
        say(data.porters[notesSent++ % data.porters.length]);
      }
    }
    bill.textContent = damage ? `${data.billLabel}: GBP${damage.toLocaleString('en-GB')}` : '';
  }

  // Removes a rough sphere of blocks, hurts and flings everything nearby, and sets off creepers and TNT in range.
  function explode(pos: THREE.Vector3, radius: number): void {
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dy, dz);
          if (d > radius - Math.random() * 0.9) continue;
          const x = Math.floor(pos.x) + dx;
          const y = Math.floor(pos.y) + dy;
          const z = Math.floor(pos.z) + dz;
          const b = world.get(x, y, z);
          if (b === B.TNT) {
            world.set(x, y, z, B.AIR);
            fuses.push({ x, y, z, t: 0.2 + Math.random() * 0.4 });
            continue;
          }
          if (Math.random() < 0.08 && b !== B.AIR && b !== B.WATER)
            particle(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), COLOR_OF[b] ?? 0x777777, 9);
          breakBlock(x, y, z);
        }
    for (let i = 0; i < 14; i++) particle(pos, i % 2 ? 0xffffff : 0xffa030, 12);
    const reach = radius * 2;
    const centre = tmp.copy(player.pos).setY(player.pos.y + 0.9);
    const pd = centre.distanceTo(pos);
    if (pd < reach) {
      const f = 1 - pd / reach;
      dir.copy(centre).sub(pos).normalize();
      player.vel.addScaledVector(dir, 16 * f);
      player.vel.y += 7 * f;
      hurt(Math.ceil(f * 16), pick(data.deaths.creeper));
    }
    shake = Math.max(shake, Math.max(0, 1 - pd / 40) * 0.6 * slow);
    boom(600, Math.max(0.05, 0.5 * (1 - pd / 80)));
    for (const m of mobs) {
      if (m.dead) continue;
      const d = m.body.pos.distanceTo(pos);
      if (d > reach) continue;
      const f = 1 - d / reach;
      dir.copy(m.body.pos).sub(pos).normalize();
      m.body.vel.addScaledVector(dir, 14 * f);
      m.body.vel.y += 6 * f;
      m.hurt = 0.6;
      if (m.kind === 'creeper') {
        // Chain reaction.
        if (m.fuse < 0 || m.fuse > 0.6) m.fuse = 0.15 + Math.random() * 0.45;
        m.chained = true;
      } else {
        m.hp -= Math.ceil(f * 8);
        if (m.hp <= 0) killZombie(m);
      }
    }
  }

  function killZombie(m: Mob): void {
    m.dead = true;
    stats.zombies++;
    if (m.member) say(fill(pick(data.zombieDown), m.member));
    respawns.push({ member: m.member, t: 15 });
    for (let i = 0; i < 8; i++) particle(m.body.pos.clone().setY(m.body.pos.y + 1), 0x5f9e5a, 4);
  }

  const events = {
    slow,
    explode(m: Mob) {
      m.dead = true;
      stats.creepers++;
      explode(m.body.pos.clone().setY(m.body.pos.y + 0.8), BLAST);
    },
    attack(m: Mob) {
      dir.copy(player.pos).sub(m.body.pos).setY(0).normalize();
      player.vel.addScaledVector(dir, 6);
      player.vel.y += 3;
      beep(110, 200, 'sawtooth', 0.08);
      if (Math.random() < 0.3 && m.member) say(`${m.member.name}: ${pick(data.zombieGreet)}`);
      hurt(2, fill(pick(data.deaths.zombie), m.member));
    },
    hiss() {
      boom(1200, 0.05);
    },
  };

  // Player actions.
  function aim(): { o: THREE.Vector3; d: THREE.Vector3 } {
    const o = new THREE.Vector3();
    camera.getWorldPosition(o);
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    return { o, d };
  }

  function attack(): void {
    const { o, d } = aim();
    const hit = world.raycast(o, d, REACH);
    let best: Mob | null = null;
    let bestT = hit ? hit.dist : 4;
    for (const m of mobs) {
      if (m.dead) continue;
      const t = rayBox(o, d, m.body);
      if (t !== null && t < bestT && t < 4) {
        best = m;
        bestT = t;
      }
    }
    if (best) {
      best.hp -= 1;
      best.hurt = 0.35;
      best.body.vel.addScaledVector(d.setY(0).normalize(), 8);
      best.body.vel.y = 5;
      beep(best.kind === 'creeper' ? 300 : 140, 80, 'square', 0.08);
      if (best.hp <= 0) {
        if (best.kind === 'zombie') killZombie(best);
        else {
          best.dead = true;
          for (let i = 0; i < 8; i++)
            particle(best.body.pos.clone().setY(best.body.pos.y + 1), 0x4caf50, 4);
        }
      }
      return;
    }
    if (!hit) return;
    const b = world.get(hit.x, hit.y, hit.z);
    if (b === B.TNT) {
      world.set(hit.x, hit.y, hit.z, B.AIR);
      fuses.push({ x: hit.x, y: hit.y, z: hit.z, t: 2.5 });
      say('Ssssss...');
      return;
    }
    if (b === B.BEDROCK) return;
    for (let i = 0; i < 5; i++)
      particle(
        new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5),
        COLOR_OF[b] ?? 0x777777,
        3,
      );
    beep(220 + Math.random() * 80, 40, 'triangle', 0.06);
    breakBlock(hit.x, hit.y, hit.z);
  }

  function place(): void {
    const { o, d } = aim();
    const hit = world.raycast(o, d, REACH);
    if (!hit) return;
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    const there = world.get(x, y, z);
    if (!world.inside(x, y, z) || (there !== B.AIR && there !== B.WATER)) return;
    const p = player.pos;
    const inPlayer =
      x + 1 > p.x - player.half &&
      x < p.x + player.half &&
      z + 1 > p.z - player.half &&
      z < p.z + player.half &&
      y + 1 > p.y &&
      y < p.y + player.height;
    if (inPlayer) return;
    world.set(x, y, z, HOTBAR[selected]);
    beep(330, 40, 'triangle', 0.05);
  }

  // Input.
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // Esc releases the mouse first; only a second Esc closes the game.
      if (document.pointerLockElement || performance.now() - unlockedAt < 400) {
        e.stopImmediatePropagation();
        if (document.pointerLockElement) document.exitPointerLock();
      }
      return;
    }
    if (paused) return;
    keys.add(e.code);
    if (/^Digit[1-6]$/.test(e.code)) selectSlot(Number(e.code.slice(5)) - 1);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  function onMouseMove(e: MouseEvent): void {
    if (paused) return;
    if (!document.pointerLockElement && !(dragLook && e.buttons)) return;
    yaw -= e.movementX * 0.0025;
    pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0025));
  }
  function onMouseDown(e: MouseEvent): void {
    if (paused) return;
    if (e.button === 0) attack();
    if (e.button === 2) place();
  }
  function onWheel(e: WheelEvent): void {
    if (paused) return;
    selectSlot(selected + Math.sign(e.deltaY));
  }
  const noMenu = (e: Event) => e.preventDefault();
  const onBlur = () => keys.clear();

  addEventListener('keydown', onKeyDown, true);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
  wrap.addEventListener('contextmenu', noMenu);

  function resize(): void {
    const w = root.clientWidth || 1;
    const h = root.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  // Start: a crowd of creepers and one zombie per roster member.
  for (let i = 0; i < CREEPERS; i++) {
    const p = randomSpawn(16, 90);
    if (p) addMob(makeCreeper(p));
  }
  if (roster.length) roster.forEach((m) => spawnZombie(m));
  else for (let i = 0; i < 6; i++) spawnZombie();
  setHp(MAX_HP);
  selectSlot(0);
  showPanel('menu');

  let creeperTimer = 0;
  let last = performance.now();
  let raf = 0;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function update(dt: number): void {
    // Movement relative to yaw.
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const want = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) want.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) want.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) want.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) want.sub(right);
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (want.lengthSq())
      want.normalize().multiplyScalar((sprint ? 7 : 4.6) * (player.inWater ? 0.55 : 1));
    const k = 1 - Math.exp(-dt * (player.onGround ? 14 : 3));
    player.vel.x += (want.x - player.vel.x) * k;
    player.vel.z += (want.z - player.vel.z) * k;
    if (keys.has('Space')) {
      if (player.inWater) player.vel.y = Math.max(player.vel.y, 4);
      else if (player.onGround) player.vel.y = JUMP;
    }
    const falling = player.vel.y;
    step(world, player, dt);
    if (player.onGround && falling < -20)
      hurt(Math.floor((-falling - 18) / 2), pick(data.deaths.fall));

    sinceHurt += dt;
    if (
      sinceHurt > 5 &&
      hp < MAX_HP &&
      Math.floor(sinceHurt * 0.5) !== Math.floor((sinceHurt - dt) * 0.5)
    )
      setHp(hp + 1);

    for (const m of mobs) if (!m.dead) updateMob(world, m, player, dt, events);
    for (let i = mobs.length - 1; i >= 0; i--) {
      const m = mobs[i];
      // Mobs that fell out of the map or wandered far away are recycled.
      if (m.body.pos.y < -5) m.dead = true;
      if (!m.dead) continue;
      scene.remove(m.mesh);
      disposeMob(m);
      mobs.splice(i, 1);
    }
    creeperTimer -= dt;
    const creepers = mobs.filter((m) => m.kind === 'creeper').length;
    if (creeperTimer <= 0 && creepers < CREEPERS) {
      creeperTimer = 1.5;
      const p = randomSpawn(20, 60);
      if (p) addMob(makeCreeper(p));
    }
    for (let i = respawns.length - 1; i >= 0; i--) {
      respawns[i].t -= dt;
      if (respawns[i].t <= 0 && spawnZombie(respawns[i].member)) respawns.splice(i, 1);
    }
    for (let i = fuses.length - 1; i >= 0; i--) {
      const f = fuses[i];
      f.t -= dt;
      if (f.t > 0) continue;
      fuses.splice(i, 1);
      explode(new THREE.Vector3(f.x + 0.5, f.y + 0.5, f.z + 0.5), BLAST);
    }
  }

  function updateHud(): void {
    let near = '';
    let best = 14;
    for (const s of world.signs) {
      const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
      if (d < best) {
        best = d;
        near = s.text;
      }
    }
    area.textContent = near;
    coords.textContent = `X ${Math.floor(player.pos.x)}  Y ${Math.floor(player.pos.y - GROUND)}  Z ${Math.floor(player.pos.z)}`;
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.vel.y -= 20 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 5;
      if (p.life > 0) continue;
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
    world.remesh(6);

    camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
    shake *= Math.exp(-dt * 5);
    camera.rotation.set(
      pitch + (Math.random() - 0.5) * shake * 0.2,
      yaw + (Math.random() - 0.5) * shake * 0.2,
      0,
    );
    const { o, d } = aim();
    const hit = paused ? null : world.raycast(o, d, REACH);
    outline.visible = !!hit;
    if (hit) outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    updateHud();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    timers.forEach(clearTimeout);
    removeEventListener('keydown', onKeyDown, true);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('blur', onBlur);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('pointerlockerror', onLockError);
    if (document.pointerLockElement) document.exitPointerLock();
    for (const m of mobs) disposeMob(m);
    for (const s of signs.children as THREE.Sprite[]) {
      s.material.map?.dispose();
      s.material.dispose();
    }
    particleGeom.dispose();
    particleMats.forEach((m) => m.dispose());
    outline.geometry.dispose();
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    wrap.remove();
  };
}
