// Arcade plane: a box model in college colours and simple flight physics (throttle, pitch, roll, yaw, stall).
import * as THREE from 'three';

export const STALL_SPEED = 17;
const THRUST = 24;
const DRAG = 0.012;
const G = 9.8;
const PITCH_RATE = 1.1;
const ROLL_RATE = 2.2;
const YAW_RATE = 0.45;
// Turn rate from bank angle.
const BANK_TURN = 0.9;
export const CEILING = 380;

export interface Controls {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
}

export interface Plane {
  mesh: THREE.Group;
  prop: THREE.Mesh;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
  speed: number;
  sink: number;
  throttle: number;
  onGround: boolean;
  stalled: boolean;
}

const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh => {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  m.position.set(x, y, z);
  return m;
};

// Model faces -z: red fuselage, gold wings, blue tail, a pilot whose head is a roster face (if given).
export function makePlane(face?: THREE.Texture): Plane {
  const g = new THREE.Group();
  g.add(box(1.3, 1.3, 7, 0x9b1c2e, 0, 0, 0));
  g.add(box(1.1, 1, 1.4, 0x6d0f1d, 0, 0, -4.1));
  g.add(box(11, 0.18, 1.7, 0xd1b948, 0, 0.1, -0.8));
  g.add(box(4, 0.15, 1, 0xd1b948, 0, 0.3, 3.2));
  g.add(box(0.15, 1.6, 1.2, 0x23407a, 0, 1.2, 3.2));
  g.add(box(0.2, 0.9, 0.2, 0x333333, -1.4, -0.9, -1.2));
  g.add(box(0.2, 0.9, 0.2, 0x333333, 1.4, -0.9, -1.2));
  const prop = box(3.2, 0.25, 0.08, 0x222222, 0, 0, -4.85);
  g.add(prop);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xe9c9a8 }),
  );
  head.position.set(0, 1.05, -0.3);
  g.add(head);
  if (face) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: face }));
    s.scale.set(1.1, 1.1, 1);
    s.position.set(0, 1.25, -0.3);
    g.add(s);
  }
  return {
    mesh: g,
    prop,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(),
    speed: 0,
    sink: 0,
    throttle: 0.6,
    onGround: false,
    stalled: false,
  };
}

// Puts the plane at (x, alt, z) flying level on a compass heading (degrees clockwise from north = -z).
export function resetPlane(p: Plane, x: number, z: number, alt: number, heading: number): void {
  p.pos.set(x, alt, z);
  p.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-heading * Math.PI) / 180);
  p.speed = 34;
  p.sink = 0;
  p.throttle = 0.6;
  p.onGround = false;
  p.stalled = false;
  p.vel.set(0, 0, 0);
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const q = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

export const forwardOf = (p: Plane, out = new THREE.Vector3()) =>
  out.set(0, 0, -1).applyQuaternion(p.quat);
export const rightOf = (p: Plane, out = new THREE.Vector3()) =>
  out.set(1, 0, 0).applyQuaternion(p.quat);

// Advances the plane by dt seconds.
export function stepPlane(p: Plane, c: Controls, dt: number): void {
  p.throttle = THREE.MathUtils.clamp(p.throttle + c.throttle * 0.6 * dt, 0, 1);
  forwardOf(p, fwd);
  rightOf(p, right);

  // Control surfaces, weaker when slow.
  const authority = THREE.MathUtils.clamp(p.speed / 25, 0.25, 1);
  let pitch = c.pitch * PITCH_RATE * authority;
  let roll = -c.roll * ROLL_RATE * authority;
  const yaw = -c.yaw * YAW_RATE * authority;
  // Rolls back toward level with no roll input.
  if (!c.roll && !p.onGround) roll -= right.y * 1.4;
  // Stalled: the nose drops.
  if (p.stalled) pitch -= 0.6 * Math.max(0, fwd.y + 0.6);
  // Above the ceiling the nose is pushed down.
  if (p.pos.y > CEILING && fwd.y > -0.3) pitch -= 0.8;
  if (p.onGround) {
    // Wheels down: wings level, nose only lifts once fast enough.
    roll = -right.y * 4;
    pitch = p.speed > STALL_SPEED ? Math.max(0, pitch) : fwd.y > 0 ? -1 : 0;
  }
  p.quat.multiply(q.setFromAxisAngle(X, pitch * dt));
  p.quat.multiply(q.setFromAxisAngle(Z, roll * dt));
  p.quat.multiply(q.setFromAxisAngle(Y, yaw * dt));
  // Banked turn about the world vertical.
  if (!p.onGround) p.quat.premultiply(q.setFromAxisAngle(Y, right.y * BANK_TURN * dt));
  p.quat.normalize();
  forwardOf(p, fwd);

  // Speed along the nose: thrust, drag, and gravity when climbing or diving.
  const brake = p.onGround ? 0.6 * p.speed : 0;
  p.speed += (p.throttle * THRUST - DRAG * p.speed * p.speed - G * fwd.y - brake) * dt;
  p.speed = Math.max(0, p.speed);

  // Lift falls off below the stall speed and the plane sinks.
  const lift = THREE.MathUtils.clamp((p.speed - 10) / (STALL_SPEED - 10), 0, 1);
  p.stalled = !p.onGround && lift < 1;
  if (p.onGround) p.sink = 0;
  else if (lift < 1) p.sink = Math.min(30, p.sink + (1 - lift) * G * dt);
  else p.sink *= Math.exp(-dt * 2);

  p.vel.copy(fwd).multiplyScalar(p.speed);
  p.vel.y -= p.sink;
  if (p.onGround) p.vel.y = Math.max(0, p.vel.y);
  p.pos.addScaledVector(p.vel, dt);
  p.mesh.position.copy(p.pos);
  p.mesh.quaternion.copy(p.quat);
  p.prop.rotation.z += dt * (10 + p.throttle * 50);
}

// Bank angle in degrees (positive = right wing down).
export const bankOf = (p: Plane) =>
  (-Math.asin(THREE.MathUtils.clamp(rightOf(p).y, -1, 1)) * 180) / Math.PI;

export function disposePlane(p: Plane): void {
  p.mesh.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}
