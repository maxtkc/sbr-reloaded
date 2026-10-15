// QWOP runner physics: a Matter.js ragdoll in centimetres (ground top at y = 0) with motors on every joint.
import type MatterNS from 'matter-js';

export type Side = 'l' | 'r';
export type PartName =
  | 'torso'
  | 'head'
  | `thigh-${Side}`
  | `calf-${Side}`
  | `foot-${Side}`
  | `upper-${Side}`
  | `lower-${Side}`;

export interface Keys {
  q: boolean;
  w: boolean;
  o: boolean;
  p: boolean;
}

interface Joint {
  a: MatterNS.Body;
  b: MatterNS.Body;
  min: number;
  max: number;
  // Share (0 to 1) of the gap to the target relative speed closed each step, and the max target speed (rad/step).
  strength: number;
  speed: number;
}

export interface Runner {
  parts: Record<PartName, MatterNS.Body>;
  // Body parts that end the run when they touch the ground.
  fatal: Set<MatterNS.Body>;
  // Runs the joint motors for this step; limp drops every motor except the joint limits.
  drive: (keys: Keys, limp: boolean) => void;
  remove: () => void;
}

const GROUP = -7;

// Segment lengths between joints.
const THIGH = 46;
const CALF = 44;
const ANKLE_H = 10;
const TORSO = 63;
const UPPER = 32;
const LOWER = 30;

// Neutral pose: a slight A-frame so the runner can stand with nothing pressed.
const HIP_REST = 0.22;
const KNEE_REST = 0.12;
// Pressed targets: hip forward/back (positive is forward) and knee bend.
const HIP_FWD = 1.15;
const HIP_BACK = -0.7;
const KNEE_BEND = 1.6;
const KNEE_STRAIGHT = 0.05;

// Motors aim for a relative speed of ERR_GAIN x the angle error per step.
const ERR_GAIN = 0.5;
// Feet are heavy so the stacked body cannot tip them over in the contact solver.
const FOOT_DENSITY = 0.01;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Point {
  x: number;
  y: number;
}

// The point len along direction fwd (0 is straight down, positive swings toward +x) from p.
const along = (p: Point, fwd: number, len: number): Point => ({
  x: p.x + Math.sin(fwd) * len,
  y: p.y + Math.cos(fwd) * len,
});

export function createRunner(Matter: typeof MatterNS, engine: MatterNS.Engine, x0: number): Runner {
  const { Bodies, Body, Composite, Constraint } = Matter;
  const opts = (extra: MatterNS.IChamferableBodyDefinition = {}) => ({
    collisionFilter: { group: GROUP },
    friction: 0.8,
    frictionAir: 0.01,
    density: 0.0012,
    ...extra,
  });

  // A limb from joint p1 to joint p2, overlapping both joints a little.
  const limb = (p1: Point, p2: Point, w: number, extra?: MatterNS.IChamferableBodyDefinition) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const body = Bodies.rectangle(
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
      w,
      Math.hypot(dx, dy) + 6,
      opts(extra),
    );
    Body.setAngle(body, Math.atan2(-dx, dy));
    return body;
  };

  // Standing pose: legs in the rest A-frame with the feet flat on the ground.
  const fwd = { l: HIP_REST, r: -HIP_REST };
  const hipY = -ANKLE_H - THIGH * Math.cos(HIP_REST) - CALF * Math.cos(HIP_REST - KNEE_REST);
  const hip = { x: x0, y: hipY };
  const neck = { x: x0, y: hipY - TORSO };
  const shoulder = { x: x0, y: neck.y + 7 };
  const elbow = along(shoulder, 0, UPPER);
  const wrist = along(elbow, -0.4, LOWER);

  const torso = limb(neck, hip, 30, { density: 0.0016 });
  const head = Bodies.circle(x0, neck.y - 13, 13, opts({ density: 0.0016 }));
  const parts = { torso, head } as Record<PartName, MatterNS.Body>;
  const pts: Record<string, Point> = { neck, shoulder, elbow, wrist, hip };
  for (const s of ['l', 'r'] as Side[]) {
    const knee = along(hip, fwd[s], THIGH);
    const ankle = along(knee, fwd[s] - KNEE_REST, CALF);
    pts[`knee-${s}`] = knee;
    pts[`ankle-${s}`] = ankle;
    parts[`thigh-${s}`] = limb(hip, knee, 14);
    parts[`calf-${s}`] = limb(knee, ankle, 11);
    parts[`foot-${s}`] = Bodies.rectangle(
      ankle.x + 4,
      ankle.y + 5,
      28,
      10,
      opts({ friction: 1.2, frictionStatic: 5, density: FOOT_DENSITY }),
    );
    parts[`upper-${s}`] = limb(shoulder, elbow, 10, { density: 0.0008 });
    parts[`lower-${s}`] = limb(elbow, wrist, 9, { density: 0.0008 });
  }

  const constraints: MatterNS.Constraint[] = [];
  const joints: Record<string, Joint> = {};
  // Pins a and b together at world point p and registers a motor for the pair.
  const pin = (
    name: string,
    a: MatterNS.Body,
    b: MatterNS.Body,
    p: Point,
    min: number,
    max: number,
    strength: number,
    speed: number,
  ) => {
    constraints.push(
      Constraint.create({
        bodyA: a,
        bodyB: b,
        pointA: { x: p.x - a.position.x, y: p.y - a.position.y },
        pointB: { x: p.x - b.position.x, y: p.y - b.position.y },
        length: 0,
        stiffness: 1,
        damping: 0.1,
        render: { visible: false },
      }),
    );
    joints[name] = { a, b, min, max, strength, speed };
  };

  pin('neck', torso, head, neck, -0.35, 0.35, 0.5, 0.1);
  for (const s of ['l', 'r'] as Side[]) {
    // Hip and knee angles are b relative to a; for the hip, forward (knee toward +x) is negative.
    pin(`hip-${s}`, torso, parts[`thigh-${s}`], hip, -1.9, 1.0, 0.9, 0.16);
    pin(`knee-${s}`, parts[`thigh-${s}`], parts[`calf-${s}`], pts[`knee-${s}`], 0, 2.5, 0.9, 0.2);
    pin(
      `ankle-${s}`,
      parts[`calf-${s}`],
      parts[`foot-${s}`],
      pts[`ankle-${s}`],
      -0.7,
      0.7,
      0.3,
      0.1,
    );
    pin(`shoulder-${s}`, torso, parts[`upper-${s}`], shoulder, -2.6, 1.4, 0.05, 0.1);
    pin(`elbow-${s}`, parts[`upper-${s}`], parts[`lower-${s}`], elbow, -2.3, 0, 0.05, 0.1);
  }

  Composite.add(engine.world, [...Object.values(parts), ...constraints]);

  // Drives joint j toward target (relative angle) by trading angular velocity between its two bodies, which keeps
  // their total angular momentum. Outside the limits a firm push back always applies.
  function motor(j: Joint, target: number | null): void {
    const rel = wrap(j.b.angle - j.a.angle);
    const relVel = j.b.angularVelocity - j.a.angularVelocity;
    let want = relVel;
    let share = 0;
    if (target !== null) {
      const err = Math.min(j.max, Math.max(j.min, target)) - rel;
      want = Math.max(-j.speed, Math.min(j.speed, err * ERR_GAIN));
      share = j.strength;
    }
    if (rel < j.min || rel > j.max) {
      want = ((rel < j.min ? j.min : j.max) - rel) * 0.3;
      share = 0.9;
    }
    const delta = (want - relVel) * share;
    if (!delta) return;
    const ia = j.a.inertia;
    const ib = j.b.inertia;
    Body.setAngularVelocity(j.a, j.a.angularVelocity - (delta * ib) / (ia + ib));
    Body.setAngularVelocity(j.b, j.b.angularVelocity + (delta * ia) / (ia + ib));
  }

  function drive(keys: Keys, limp: boolean): void {
    // Hip targets: Q swings the left thigh forward and the right back, W the reverse.
    let hipL: number | null = HIP_REST;
    let hipR: number | null = -HIP_REST;
    if (keys.q !== keys.w) {
      hipL = keys.q ? HIP_FWD : HIP_BACK;
      hipR = keys.q ? HIP_BACK : HIP_FWD;
    }
    // Knee targets: O bends the left knee and straightens the right, P the reverse.
    let kneeL: number | null = KNEE_REST;
    let kneeR: number | null = KNEE_REST;
    if (keys.o !== keys.p) {
      kneeL = keys.o ? KNEE_BEND : KNEE_STRAIGHT;
      kneeR = keys.o ? KNEE_STRAIGHT : KNEE_BEND;
    }
    if (limp) hipL = hipR = kneeL = kneeR = null;
    motor(joints['hip-l'], hipL === null ? null : -hipL);
    motor(joints['hip-r'], hipR === null ? null : -hipR);
    motor(joints['knee-l'], kneeL);
    motor(joints['knee-r'], kneeR);
    // Ankles hold the feet square to the calves; arms swing with the opposite leg.
    for (const s of ['l', 'r'] as Side[]) {
      motor(joints[`ankle-${s}`], limp ? null : 0);
      const other = parts[`thigh-${s === 'l' ? 'r' : 'l'}`];
      motor(joints[`shoulder-${s}`], limp ? null : wrap(other.angle - torso.angle) * 0.8);
      motor(joints[`elbow-${s}`], limp ? null : -0.5);
    }
    motor(joints.neck, limp ? null : 0);
  }

  return {
    parts,
    fatal: new Set([torso, head]),
    drive,
    remove: () => Composite.remove(engine.world, [...Object.values(parts), ...constraints]),
  };
}
