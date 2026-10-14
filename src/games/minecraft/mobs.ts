// Mob models (creepers, roster-faced zombies), text sprites, and per-frame mob AI.
import * as THREE from 'three';
import { makeBody, step, JUMP, type Body } from './body';
import type { World } from './world';

export interface Member {
  name: string;
  role: string;
  face: string;
}

export interface Mob {
  kind: 'creeper' | 'zombie';
  body: Body;
  mesh: THREE.Group;
  legs: THREE.Object3D[];
  mats: THREE.MeshLambertMaterial[];
  hp: number;
  // Seconds left on a lit creeper, or -1.
  fuse: number;
  // Lit by another explosion: does not defuse when the player walks away.
  chained: boolean;
  cooldown: number;
  heading: number;
  wander: number;
  hurt: number;
  phase: number;
  member?: Member;
  dead: boolean;
}

// Canvas text sprite; height in world units.
export function label(text: string, height: number, bg: string, fg: string): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '600 40px system-ui, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 32;
  c.height = 60;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.font = font;
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.fillText(text, 16, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set((height * c.width) / c.height, height, 1);
  return s;
}

function pixelTexture(rows: string[], palette: Record<string, string>): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      g.fillStyle = palette[ch];
      g.fillRect(x, y, 1, 1);
    }),
  );
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let creeperFace: THREE.CanvasTexture | undefined;
function getCreeperFace(): THREE.CanvasTexture {
  creeperFace ??= pixelTexture(
    [
      'gggggggg',
      'gggggggg',
      'gkkggkkg',
      'gkkggkkg',
      'gggkkggg',
      'ggkkkkgg',
      'ggkkkkgg',
      'ggkggkgg',
    ],
    { g: '#4caf50', k: '#111111' },
  );
  return creeperFace;
}

// Roster face, greened, on zombie skin.
function zombieFace(url: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5f9e5a';
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, 0, 0, 128, 128);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = '#9fd49a';
    g.fillRect(0, 0, 128, 128);
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material | THREE.Material[],
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Leg pivoting at its top.
function leg(
  w: number,
  h: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Object3D {
  const pivot = new THREE.Object3D();
  pivot.position.set(x, y, z);
  pivot.add(box(w, h, w, mat, 0, -h / 2, 0));
  return pivot;
}

function base(kind: Mob['kind'], pos: THREE.Vector3, hp: number): Mob {
  return {
    kind,
    body: makeBody(pos, 0.3, kind === 'creeper' ? 1.6 : 1.85),
    mesh: new THREE.Group(),
    legs: [],
    mats: [],
    hp,
    fuse: -1,
    chained: false,
    cooldown: 0,
    heading: Math.random() * Math.PI * 2,
    wander: 0,
    hurt: 0,
    phase: Math.random() * 10,
    dead: false,
  };
}

// Mobs face +z in model space.
export function makeCreeper(pos: THREE.Vector3): Mob {
  const mob = base('creeper', pos, 3);
  const skin = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
  const face = new THREE.MeshLambertMaterial({ map: getCreeperFace() });
  mob.mats = [skin, face];
  const g = mob.mesh;
  g.add(box(0.5, 0.75, 0.3, skin, 0, 0.4 + 0.375, 0));
  g.add(box(0.5, 0.5, 0.5, [skin, skin, skin, skin, face, skin], 0, 1.15 + 0.25 - 0.05, 0));
  for (const [x, z] of [
    [-0.13, 0.2],
    [0.13, 0.2],
    [-0.13, -0.2],
    [0.13, -0.2],
  ]) {
    const l = leg(0.25, 0.4, skin, x, 0.4, z);
    mob.legs.push(l);
    g.add(l);
  }
  return mob;
}

export function makeZombie(pos: THREE.Vector3, member?: Member): Mob {
  const mob = base('zombie', pos, 4);
  mob.member = member;
  const skin = new THREE.MeshLambertMaterial({ color: 0x5f9e5a });
  const gown = new THREE.MeshLambertMaterial({ color: 0x222228 });
  const trousers = new THREE.MeshLambertMaterial({ color: 0x3b4fa0 });
  const face = new THREE.MeshLambertMaterial(
    member ? { map: zombieFace(member.face) } : { color: 0x4f8e4a },
  );
  mob.mats = [skin, gown, trousers, face];
  const g = mob.mesh;
  g.add(box(0.5, 0.7, 0.28, gown, 0, 0.75 + 0.35, 0));
  g.add(box(0.5, 0.5, 0.5, [skin, skin, skin, skin, face, skin], 0, 1.45 + 0.25, 0));
  // Arms held out in front.
  g.add(box(0.2, 0.2, 0.65, gown, -0.35, 1.3, 0.3));
  g.add(box(0.2, 0.2, 0.65, gown, 0.35, 1.3, 0.3));
  for (const x of [-0.12, 0.12]) {
    const l = leg(0.24, 0.75, trousers, x, 0.75, 0);
    mob.legs.push(l);
    g.add(l);
  }
  if (member) {
    const tag = label(`${member.name} (${member.role})`, 0.28, 'rgba(0,0,0,0.45)', '#ffffff');
    tag.position.y = 2.25;
    g.add(tag);
  }
  return mob;
}

export interface MobEvents {
  slow: number;
  explode(mob: Mob): void;
  attack(mob: Mob): void;
  hiss(mob: Mob): void;
}

// Chases the player within range, otherwise wanders. Lit creepers stand still and flash.
export function updateMob(world: World, mob: Mob, player: Body, dt: number, ev: MobEvents): void {
  const b = mob.body;
  const dx = player.pos.x - b.pos.x;
  const dz = player.pos.z - b.pos.z;
  const flat = Math.hypot(dx, dz);
  const dist = Math.hypot(flat, player.pos.y - b.pos.y);
  mob.cooldown -= dt;
  mob.hurt = Math.max(0, mob.hurt - dt);
  let speed = 0;

  if (mob.kind === 'creeper' && mob.fuse >= 0) {
    mob.fuse -= dt;
    if (!mob.chained && dist > 7) mob.fuse = -1;
    else if (mob.fuse <= 0) return ev.explode(mob);
  } else if (dist < (mob.kind === 'creeper' ? 26 : 32)) {
    mob.heading = Math.atan2(dx, dz);
    speed = (mob.kind === 'creeper' ? 2.7 : 2.2) * ev.slow;
    if (mob.kind === 'creeper' && dist < 2.4) {
      mob.fuse = 1.5;
      speed = 0;
      ev.hiss(mob);
    }
    if (mob.kind === 'zombie' && flat < 1.2 && Math.abs(player.pos.y - b.pos.y) < 1.6) {
      speed = 0;
      if (mob.cooldown <= 0) {
        mob.cooldown = 1;
        ev.attack(mob);
      }
    }
  } else {
    mob.wander -= dt;
    if (mob.wander <= 0) {
      mob.wander = 2 + Math.random() * 4;
      mob.heading = Math.random() * Math.PI * 2;
    }
    speed = mob.wander > 1.5 ? 1.1 * ev.slow : 0;
  }

  // Knockback (hurt) overrides walking until it decays.
  if (mob.hurt <= 0) {
    const k = 1 - Math.exp(-dt * 10);
    b.vel.x += (Math.sin(mob.heading) * speed - b.vel.x) * k;
    b.vel.z += (Math.cos(mob.heading) * speed - b.vel.z) * k;
  } else {
    b.vel.x *= Math.exp(-dt * 2);
    b.vel.z *= Math.exp(-dt * 2);
  }
  if (b.bumped && speed > 0 && (b.onGround || b.inWater)) b.vel.y = b.inWater ? 4 : JUMP;
  if (b.inWater && speed > 0) b.vel.y = Math.max(b.vel.y, 1.5);
  step(world, b, dt);

  mob.mesh.position.copy(b.pos);
  mob.mesh.rotation.y = mob.heading;
  mob.phase += dt * Math.hypot(b.vel.x, b.vel.z) * 3;
  const swing = Math.sin(mob.phase) * 0.7;
  mob.legs.forEach((l, i) => (l.rotation.x = i % 2 ? swing : -swing));
  const lit = mob.fuse >= 0;
  const flash = (lit && Math.floor(mob.fuse * 8) % 2 === 0) || mob.hurt > 0.15;
  for (const m of mob.mats) m.emissive.setHex(flash ? (lit ? 0xffffff : 0xff2222) : 0x000000);
  const swell = lit ? 1 + (1.5 - Math.max(0, mob.fuse)) * 0.15 : 1;
  mob.mesh.scale.set(swell, swell, swell);
}

export function disposeMob(mob: Mob): void {
  mob.mesh.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
    if (o instanceof THREE.Sprite) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
  for (const m of mob.mats) {
    if (m.map && m.map !== creeperFace) m.map.dispose();
    m.dispose();
  }
}
