// Builds the flight sim scene from src/data/flight.json: ground layers, roads, the Cam, extruded buildings,
// plus lookups for collisions (buildings, water).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import raw from '../../data/flight.json';

type Pt = [number, number];
type Rings = Pt[][];
interface Building {
  r: Rings;
  h: number;
  c: 'stone' | 'brick' | 'shop';
}
interface Area {
  k: string;
  r: Rings;
}
interface Ribbon {
  k: string;
  w: number;
  p: Pt[];
}
export interface Marker {
  id: string;
  name: string;
  x: number;
  z: number;
}
interface FlightData {
  bounds: [number, number, number, number];
  attribution: string;
  start: { x: number; z: number; heading: number; alt: number };
  markers: Marker[];
  areas: Area[];
  ribbons: Ribbon[];
  buildings: Building[];
}
const data = raw as unknown as FlightData;

export const ATTRIBUTION = data.attribution;
export const BOUNDS = data.bounds;
export const START = data.start;
export const MARKERS = data.markers;

const GROUND = 0x7fa860;
// Ground layers drawn in this order over the ground plane.
const LAYERS: [string, number][] = [
  ['town', 0xc9bfae],
  ['court', 0xd8ccb0],
  ['grass', 0x76b04f],
  ['pitch', 0x8cc463],
  ['wood', 0x3f7a3a],
  ['water', 0x4f87c8],
  ['road', 0x6b6b70],
  ['path', 0xe2d6b8],
];
const WALL: Record<Building['c'], number> = { stone: 0xdccfae, brick: 0xb5674d, shop: 0xcdbfa8 };
const ROOF: Record<Building['c'], number> = { stone: 0x6d7378, brick: 0x7b4a3c, shop: 0x8a8580 };
const CELL = 40;

const shapeOf = (rings: Rings): THREE.Shape => {
  // Shape y is -z so that rotateX(-90deg) maps it back onto world z.
  const shape = new THREE.Shape(rings[0].map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of rings.slice(1))
    shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
};

// Sets one colour on every vertex, keeping only position and normal so geometries merge.
function paint(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute('uv');
  const n = out.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(c, i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return out;
}

// Flat strip along a polyline, with mitred joins.
function ribbon(points: Pt[], width: number): THREE.BufferGeometry {
  const half = width / 2;
  const left: number[][] = [];
  const right: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    // Mitre length limited so sharp turns do not spike.
    let k = 1;
    if (i > 0 && i < points.length - 1) {
      const sx = points[i][0] - a[0];
      const sz = points[i][1] - a[1];
      const sl = Math.hypot(sx, sz) || 1;
      const cos = (sx * tx + sz * tz) / sl;
      k = Math.min(2, 1 / Math.max(0.5, cos));
    }
    const nx = -tz * half * k;
    const nz = tx * half * k;
    const [x, z] = points[i];
    left.push([x + nx, z + nz]);
    right.push([x - nx, z - nz]);
  }
  const pos: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const [l0, r0, l1, r1] = [left[i - 1], right[i - 1], left[i], right[i]];
    pos.push(l0[0], 0, l0[1], r0[0], 0, r0[1], l1[0], 0, l1[1]);
    pos.push(r0[0], 0, r0[1], r1[0], 0, r1[1], l1[0], 0, l1[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const norm = new Float32Array(pos.length);
  for (let i = 1; i < norm.length; i += 3) norm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return g;
}

// Even-odd point in polygon over all rings.
function inside(rings: Rings, x: number, z: number): boolean {
  let hit = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xa, za] = r[i];
      const [xb, zb] = r[j];
      if (za > z !== zb > z && x < xa + ((z - za) * (xb - xa)) / (zb - za)) hit = !hit;
    }
  }
  return hit;
}

function segDist(x: number, z: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

interface Solid {
  rings: Rings;
  h: number;
  box: [number, number, number, number];
}

export class World {
  group = new THREE.Group();
  private solids: Solid[] = [];
  private water: { rings?: Rings; line?: Pt[]; w?: number; box: number[] }[] = [];
  private grid = new Map<string, { solids: number[]; water: number[] }>();
  private disposables: { dispose(): void }[] = [];

  constructor() {
    const [x0, z0, x1, z1] = BOUNDS;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;

    // Ground plane well past the extract, pushed back in depth so the layers on top never flicker.
    const groundGeom = new THREE.PlaneGeometry(x1 - x0 + 6000, z1 - z0 + 6000);
    groundGeom.rotateX(-Math.PI / 2);
    groundGeom.translate(cx, 0, cz);
    const groundMat = new THREE.MeshLambertMaterial({
      color: GROUND,
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 4,
    });
    this.add(new THREE.Mesh(groundGeom, groundMat), groundGeom, groundMat);

    // Ground layers: no depth writes, drawn in LAYERS order.
    LAYERS.forEach(([kind, color], i) => {
      const parts: THREE.BufferGeometry[] = [];
      const col = new THREE.Color(color);
      for (const a of data.areas) {
        if (a.k !== kind) continue;
        try {
          const g = new THREE.ShapeGeometry(shapeOf(a.r));
          g.rotateX(-Math.PI / 2);
          parts.push(paint(g, col));
        } catch {
          // Skip polygons that fail to triangulate.
        }
      }
      for (const r of data.ribbons) if (r.k === kind) parts.push(paint(ribbon(r.p, r.w), col));
      if (!parts.length) return;
      const g = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = i + 1;
      this.add(mesh, g, mat);
    });

    // Buildings: extruded, one merged mesh, walls and roofs coloured per class with a small per-building shade.
    const parts: THREE.BufferGeometry[] = [];
    const wall = new THREE.Color();
    const roof = new THREE.Color();
    data.buildings.forEach((b, i) => {
      let g: THREE.BufferGeometry;
      try {
        g = new THREE.ExtrudeGeometry(shapeOf(b.r), { depth: b.h, bevelEnabled: false });
      } catch {
        return;
      }
      g.rotateX(-Math.PI / 2);
      const shade = 0.88 + 0.12 * (((i * 2654435761) >>> 0) / 4294967296);
      wall.setHex(WALL[b.c]).multiplyScalar(shade);
      roof.setHex(ROOF[b.c]).multiplyScalar(shade);
      const out = paint(g, wall);
      const n = out.getAttribute('normal');
      const c = out.getAttribute('color') as THREE.BufferAttribute;
      for (let v = 0; v < n.count; v++) if (n.getY(v) > 0.5) c.setXYZ(v, roof.r, roof.g, roof.b);
      parts.push(out);
      const xs = b.r[0].map((p) => p[0]);
      const zs = b.r[0].map((p) => p[1]);
      this.solids.push({
        rings: b.r,
        h: b.h,
        box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
      });
    });
    const bg = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const bm = new THREE.MeshLambertMaterial({ vertexColors: true });
    const buildings = new THREE.Mesh(bg, bm);
    buildings.renderOrder = LAYERS.length + 1;
    this.add(buildings, bg, bm);

    // Water lookups.
    for (const a of data.areas) {
      if (a.k !== 'water') continue;
      const xs = a.r[0].map((p) => p[0]);
      const zs = a.r[0].map((p) => p[1]);
      this.water.push({
        rings: a.r,
        box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)],
      });
    }
    for (const r of data.ribbons) {
      if (r.k !== 'water') continue;
      const xs = r.p.map((p) => p[0]);
      const zs = r.p.map((p) => p[1]);
      const m = r.w / 2;
      this.water.push({
        line: r.p,
        w: r.w,
        box: [Math.min(...xs) - m, Math.min(...zs) - m, Math.max(...xs) + m, Math.max(...zs) + m],
      });
    }
    this.solids.forEach((s, i) => this.index(s.box, (c) => c.solids.push(i)));
    this.water.forEach((w, i) => this.index(w.box, (c) => c.water.push(i)));
  }

  private add(obj: THREE.Object3D, ...d: { dispose(): void }[]): void {
    this.group.add(obj);
    this.disposables.push(...d);
  }

  private cell(cx: number, cz: number, create = false) {
    const key = `${cx},${cz}`;
    let c = this.grid.get(key);
    if (!c && create) this.grid.set(key, (c = { solids: [], water: [] }));
    return c;
  }

  private index(box: number[], fn: (c: { solids: number[]; water: number[] }) => void): void {
    for (let cx = Math.floor(box[0] / CELL); cx <= Math.floor(box[2] / CELL); cx++)
      for (let cz = Math.floor(box[1] / CELL); cz <= Math.floor(box[3] / CELL); cz++)
        fn(this.cell(cx, cz, true)!);
  }

  // Height of the building under (x, z), or 0.
  roofAt(x: number, z: number): number {
    const c = this.cell(Math.floor(x / CELL), Math.floor(z / CELL));
    let h = 0;
    for (const i of c?.solids ?? []) {
      const s = this.solids[i];
      if (s.h <= h) continue;
      const [ax, az, bx, bz] = s.box;
      if (x < ax || x > bx || z < az || z > bz) continue;
      if (inside(s.rings, x, z)) h = s.h;
    }
    return h;
  }

  // Tallest building within radius of (x, z), by bounding box.
  tallestNear(x: number, z: number, radius: number): number {
    let h = 0;
    for (const s of this.solids) {
      const [ax, az, bx, bz] = s.box;
      if (x + radius < ax || x - radius > bx || z + radius < az || z - radius > bz) continue;
      h = Math.max(h, s.h);
    }
    return h;
  }

  isWater(x: number, z: number): boolean {
    const c = this.cell(Math.floor(x / CELL), Math.floor(z / CELL));
    for (const i of c?.water ?? []) {
      const w = this.water[i];
      const [ax, az, bx, bz] = w.box;
      if (x < ax || x > bx || z < az || z > bz) continue;
      if (w.rings && inside(w.rings, x, z)) return true;
      if (w.line)
        for (let k = 1; k < w.line.length; k++)
          if (segDist(x, z, w.line[k - 1], w.line[k]) <= w.w! / 2) return true;
    }
    return false;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
