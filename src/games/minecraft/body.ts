// AABB physics for the player and mobs against the voxel world.
import * as THREE from 'three';
import { B, type World } from './world';

export const GRAVITY = 26;
export const JUMP = 8.2;

export interface Body {
  // Feet centre.
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  half: number;
  height: number;
  onGround: boolean;
  inWater: boolean;
  // Set when horizontal movement was blocked this step.
  bumped: boolean;
}

export function makeBody(pos: THREE.Vector3, half = 0.3, height = 1.8): Body {
  return {
    pos: pos.clone(),
    vel: new THREE.Vector3(),
    half,
    height,
    onGround: false,
    inWater: false,
    bumped: false,
  };
}

// Solid cells overlapping the body, as [min, max] along axis, or null.
function overlap(world: World, b: Body, axis: 'x' | 'y' | 'z'): [number, number] | null {
  const e = 1e-4;
  const x0 = Math.floor(b.pos.x - b.half + e);
  const x1 = Math.floor(b.pos.x + b.half - e);
  const y0 = Math.floor(b.pos.y + e);
  const y1 = Math.floor(b.pos.y + b.height - e);
  const z0 = Math.floor(b.pos.z - b.half + e);
  const z1 = Math.floor(b.pos.z + b.half - e);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (!world.blocks(x, y, z)) continue;
        const c = axis === 'x' ? x : axis === 'y' ? y : z;
        lo = Math.min(lo, c);
        hi = Math.max(hi, c);
      }
  return lo === Infinity ? null : [lo, hi];
}

function moveAxis(world: World, b: Body, axis: 'x' | 'y' | 'z', delta: number): boolean {
  if (!delta) return false;
  b.pos[axis] += delta;
  const hit = overlap(world, b, axis);
  if (!hit) return false;
  const e = 1e-3;
  if (axis === 'y') b.pos.y = delta > 0 ? hit[0] - b.height - e : hit[1] + 1;
  else b.pos[axis] = delta > 0 ? hit[0] - b.half - e : hit[1] + 1 + b.half + e;
  b.vel[axis] = 0;
  return true;
}

// Integrates gravity and velocity, resolving collisions one axis at a time in sub-steps under half a block.
export function step(world: World, b: Body, dt: number): void {
  const feet = world.get(Math.floor(b.pos.x), Math.floor(b.pos.y + 0.4), Math.floor(b.pos.z));
  b.inWater = feet === B.WATER;
  b.vel.y -= (b.inWater ? GRAVITY * 0.25 : GRAVITY) * dt;
  if (b.inWater) b.vel.y = Math.max(b.vel.y, -3);
  b.vel.y = Math.max(b.vel.y, -40);
  const n = Math.max(
    1,
    Math.ceil((Math.max(Math.abs(b.vel.x), Math.abs(b.vel.y), Math.abs(b.vel.z)) * dt) / 0.45),
  );
  const h = dt / n;
  b.onGround = false;
  b.bumped = false;
  for (let i = 0; i < n; i++) {
    if (moveAxis(world, b, 'x', b.vel.x * h)) b.bumped = true;
    if (moveAxis(world, b, 'z', b.vel.z * h)) b.bumped = true;
    const vy = b.vel.y;
    if (moveAxis(world, b, 'y', vy * h) && vy < 0) b.onGround = true;
  }
}

// Ray against the body's box; distance along dir or null.
export function rayBox(o: THREE.Vector3, dir: THREE.Vector3, b: Body): number | null {
  const min = [b.pos.x - b.half, b.pos.y, b.pos.z - b.half];
  const max = [b.pos.x + b.half, b.pos.y + b.height, b.pos.z + b.half];
  const oo = [o.x, o.y, o.z];
  const dd = [dir.x, dir.y, dir.z];
  let t0 = 0;
  let t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < min[i] || oo[i] > max[i]) return null;
      continue;
    }
    let a = (min[i] - oo[i]) / dd[i];
    let c = (max[i] - oo[i]) / dd[i];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}
