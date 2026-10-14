// Voxel world built from voxels.json (2 m OSM grid): block storage, greedy-meshed chunks, raycast and collision.
import * as THREE from 'three';
import voxels from '../../data/voxels.json';

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WATER: 4,
  PATH: 5,
  ROAD: 6,
  LOG: 7,
  LEAVES: 8,
  ROOF: 9,
  BEDROCK: 10,
  DOOR: 11,
  PLANKS: 12,
  PITCH: 13,
  TNT: 14,
} as const;

const COLORS: Record<number, number> = {
  [B.GRASS]: 0x6aa84f,
  [B.DIRT]: 0x8a5a3b,
  [B.STONE]: 0xc9b48a,
  [B.WATER]: 0x3f76e4,
  [B.PATH]: 0xd6c8aa,
  [B.ROAD]: 0x5a5a5f,
  [B.LOG]: 0x6b4a2b,
  [B.LEAVES]: 0x2f7a32,
  [B.ROOF]: 0x7a4a3a,
  [B.BEDROCK]: 0x333333,
  [B.DOOR]: 0x9a6b2f,
  [B.PLANKS]: 0xb08850,
  [B.PITCH]: 0x8cc66a,
  [B.TNT]: 0xd23a2a,
};
// Grass blocks show dirt on their sides and bottom.
const GRASS_SIDE = 0x7f8a45;

export const SX = voxels.width;
export const SZ = voxels.height;
export const SY = 48;
// Top of the ground layer; buildings and players stand on GROUND + 1.
export const GROUND = 4;
const CHUNK = 16;

export interface Sign {
  text: string;
  kind: string;
  x: number;
  y: number;
  z: number;
}

export interface Hit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  dist: number;
}

const opaque = (b: number) => b !== B.AIR && b !== B.WATER;
export const solid = opaque;

// Deterministic per-tile hash in [0, 1).
const hash = (x: number, z: number) => (((x * 73856093) ^ (z * 19349663)) >>> 0) / 4294967296;

export class World {
  data = new Uint8Array(SX * SY * SZ);
  signs: Sign[] = [];
  spawn = new THREE.Vector3();
  group = new THREE.Group();
  private chunks = new Map<string, { opaque?: THREE.Mesh; water?: THREE.Mesh }>();
  private dirty = new Set<string>();
  private opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private waterMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });

  constructor() {
    this.generate();
    for (let cx = 0; cx < SX / CHUNK; cx++)
      for (let cz = 0; cz < SZ / CHUNK; cz++) this.dirty.add(`${cx},${cz}`);
    this.remesh(Infinity);
  }

  private idx(x: number, y: number, z: number): number {
    return (y * SZ + z) * SX + x;
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
  }

  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.data[this.idx(x, y, z)] : B.AIR;
  }

  // Collision lookup: outside the map is a wall, below it bedrock.
  blocks(x: number, y: number, z: number): boolean {
    if (y < 0 || x < 0 || z < 0 || x >= SX || z >= SZ) return true;
    if (y >= SY) return false;
    return solid(this.data[this.idx(x, y, z)]);
  }

  set(x: number, y: number, z: number, b: number): void {
    if (!this.inside(x, y, z)) return;
    this.data[this.idx(x, y, z)] = b;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    this.dirty.add(`${cx},${cz}`);
    if (x % CHUNK === 0) this.dirty.add(`${cx - 1},${cz}`);
    if (x % CHUNK === CHUNK - 1) this.dirty.add(`${cx + 1},${cz}`);
    if (z % CHUNK === 0) this.dirty.add(`${cx},${cz - 1}`);
    if (z % CHUNK === CHUNK - 1) this.dirty.add(`${cx},${cz + 1}`);
  }

  // Highest solid block in a column, or -1.
  top(x: number, z: number): number {
    for (let y = SY - 1; y >= 0; y--) if (solid(this.get(x, y, z))) return y;
    return -1;
  }

  private column(x: number, z: number, from: number, to: number, b: number): void {
    for (let y = from; y <= to; y++) this.data[this.idx(x, y, z)] = b;
  }

  private tree(x: number, z: number, base: number): void {
    const h = 3 + Math.floor(hash(z, x) * 2);
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 3) continue;
          const y = base + h + dy;
          if (this.get(x + dx, y, z + dz) === B.AIR)
            this.data[this.idx(x + dx, y, z + dz)] = B.LEAVES;
        }
    this.column(x, z, base, base + h, B.LOG);
  }

  private generate(): void {
    const rows = voxels.rows as string[];
    const heights = voxels.heights as string[];
    const trees: [number, number][] = [];
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const c = rows[z][x];
        this.data[this.idx(x, 0, z)] = B.BEDROCK;
        if (c === '~') {
          this.column(x, z, 1, 1, B.DIRT);
          this.column(x, z, 2, GROUND - 1, B.WATER);
          continue;
        }
        this.column(x, z, 1, GROUND - 1, B.DIRT);
        const surface =
          c === ',' || c === ';' || c === 'T'
            ? B.GRASS
            : c === 'P'
              ? B.PITCH
              : c === '='
                ? B.ROAD
                : B.PATH;
        this.data[this.idx(x, GROUND, z)] = surface;
        if (c === '#' || c === 'D') {
          const h = parseInt(heights[z][x], 36) || 6;
          this.column(x, z, GROUND + 1, GROUND + h - 1, B.STONE);
          this.data[this.idx(x, GROUND + h, z)] = B.ROOF;
          if (c === 'D') this.column(x, z, GROUND + 1, GROUND + 2, B.DOOR);
        }
        if (c === 'T') trees.push([x, z]);
        // Extra trees on open grass away from paths, and bushes in tall grass.
        if (c === ',' && hash(x, z) < 0.012 && this.openAround(rows, x, z)) trees.push([x, z]);
        if (c === ';' && hash(x, z) < 0.3) this.data[this.idx(x, GROUND + 1, z)] = B.LEAVES;
      }
    }
    for (const [x, z] of trees) this.tree(x, z, GROUND + 1);

    // Signs: one per name, above the roof for buildings.
    const seen = new Set<string>();
    for (const n of voxels.names) {
      const key = `${n.name}:${Math.round(n.x / 20)},${Math.round(n.y / 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const y = n.kind === 'building' ? this.top(n.x, n.y) + 2.5 : GROUND + 3;
      this.signs.push({ text: n.name, kind: n.kind, x: n.x + 0.5, y, z: n.y + 0.5 });
    }

    // Spawn: nearest open ground tile to the SBR.
    const [sx, sz] = voxels.spawn;
    for (let r = 0; r < 20; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const x = sx + dx;
          const z = sz + dz;
          if (this.walkable(x, z)) {
            this.spawn.set(x + 0.5, GROUND + 1, z + 0.5);
            return;
          }
        }
    }
    this.spawn.set(sx + 0.5, SY - 2, sz + 0.5);
  }

  private openAround(rows: string[], x: number, z: number): boolean {
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) if (rows[z + dz]?.[x + dx] !== ',') return false;
    return true;
  }

  // Ground-level tile with two blocks of air above it.
  walkable(x: number, z: number): boolean {
    return (
      solid(this.get(x, GROUND, z)) &&
      this.get(x, GROUND + 1, z) === B.AIR &&
      this.get(x, GROUND + 2, z) === B.AIR
    );
  }

  // Remeshes up to max dirty chunks.
  remesh(max = 4): void {
    let n = 0;
    for (const key of this.dirty) {
      if (n++ >= max) break;
      this.dirty.delete(key);
      const [cx, cz] = key.split(',').map(Number);
      if (cx < 0 || cz < 0 || cx * CHUNK >= SX || cz * CHUNK >= SZ) continue;
      const old = this.chunks.get(key);
      for (const m of [old?.opaque, old?.water]) {
        if (!m) continue;
        this.group.remove(m);
        m.geometry.dispose();
      }
      const entry = {
        opaque: this.meshChunk(cx, cz, false),
        water: this.meshChunk(cx, cz, true),
      };
      for (const m of [entry.opaque, entry.water]) if (m) this.group.add(m);
      this.chunks.set(key, entry);
    }
  }

  // Greedy mesher over one 16 x SY x 16 chunk. Water faces are drawn only against air.
  private meshChunk(cx: number, cz: number, water: boolean): THREE.Mesh | undefined {
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const dims = [Math.min(CHUNK, SX - ox), SY, Math.min(CHUNK, SZ - oz)];
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const ind: number[] = [];
    const color = new THREE.Color();
    const at = (p: number[]) => this.get(ox + p[0], p[1], oz + p[2]);
    const draws = (a: number, b: number) =>
      water ? a === B.WATER && b === B.AIR : opaque(a) && !opaque(b);

    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3;
      const v = (d + 2) % 3;
      const mask = new Int32Array(dims[u] * dims[v]);
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      q[d] = 1;
      // Plane p[d] lies between cells p[d] - 1 and p[d]; only faces of this chunk's own cells are emitted.
      for (p[d] = 0; p[d] <= dims[d]; p[d]++) {
        let n = 0;
        for (p[v] = 0; p[v] < dims[v]; p[v]++) {
          for (p[u] = 0; p[u] < dims[u]; p[u]++, n++) {
            const a = at([p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
            const b = at(p);
            mask[n] = 0;
            if (p[d] > 0 && draws(a, b)) mask[n] = a;
            else if (p[d] < dims[d] && draws(b, a)) mask[n] = -b;
          }
        }
        n = 0;
        for (let j = 0; j < dims[v]; j++) {
          for (let i = 0; i < dims[u];) {
            const c = mask[n];
            if (!c) {
              i++;
              n++;
              continue;
            }
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === c) w++;
            let h = 1;
            grow: for (; j + h < dims[v]; h++) {
              for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== c) break grow;
            }
            const base = [0, 0, 0];
            base[d] = p[d];
            base[u] = i;
            base[v] = j;
            const du = [0, 0, 0];
            const dv = [0, 0, 0];
            du[u] = w;
            dv[v] = h;
            const block = Math.abs(c);
            const sign = c > 0 ? 1 : -1;
            const vi = pos.length / 3;
            for (const [a, b] of [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
            ]) {
              pos.push(
                ox + base[0] + du[0] * a + dv[0] * b,
                base[1] + du[1] * a + dv[1] * b,
                oz + base[2] + du[2] * a + dv[2] * b,
              );
              nor.push(d === 0 ? sign : 0, d === 1 ? sign : 0, d === 2 ? sign : 0);
              const hex = block === B.GRASS && !(d === 1 && sign > 0) ? GRASS_SIDE : COLORS[block];
              color.setHex(hex);
              col.push(color.r, color.g, color.b);
            }
            // e_u x e_v = e_d, so this winding faces +d; flip for -d.
            if (sign > 0) ind.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            else ind.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
            for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
            i += w;
            n += w;
          }
        }
      }
    }
    if (!ind.length) return;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geom.setIndex(ind);
    geom.computeBoundingSphere();
    const mesh = new THREE.Mesh(geom, water ? this.waterMat : this.opaqueMat);
    if (water) mesh.renderOrder = 1;
    return mesh;
  }

  // Voxel DDA from origin along dir (unit) up to max blocks; returns the first solid block and its face normal.
  raycast(o: THREE.Vector3, dir: THREE.Vector3, max: number): Hit | null {
    let x = Math.floor(o.x);
    let y = Math.floor(o.y);
    let z = Math.floor(o.z);
    const sx = Math.sign(dir.x);
    const sy = Math.sign(dir.y);
    const sz = Math.sign(dir.z);
    const tdx = Math.abs(1 / dir.x);
    const tdy = Math.abs(1 / dir.y);
    const tdz = Math.abs(1 / dir.z);
    const frac = (p: number, s: number) => (s > 0 ? Math.floor(p) + 1 - p : p - Math.floor(p));
    let tx = sx ? frac(o.x, sx) * tdx : Infinity;
    let ty = sy ? frac(o.y, sy) * tdy : Infinity;
    let tz = sz ? frac(o.z, sz) * tdz : Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    while (t <= max) {
      if (solid(this.get(x, y, z))) return { x, y, z, nx, ny, nz, dist: t };
      if (tx < ty && tx < tz) {
        x += sx;
        t = tx;
        tx += tdx;
        [nx, ny, nz] = [-sx, 0, 0];
      } else if (ty < tz) {
        y += sy;
        t = ty;
        ty += tdy;
        [nx, ny, nz] = [0, -sy, 0];
      } else {
        z += sz;
        t = tz;
        tz += tdz;
        [nx, ny, nz] = [0, 0, -sz];
      }
    }
    return null;
  }

  dispose(): void {
    for (const { opaque: o, water: w } of this.chunks.values()) {
      o?.geometry.dispose();
      w?.geometry.dispose();
    }
    this.opaqueMat.dispose();
    this.waterMat.dispose();
  }
}

export const COLOR_OF = COLORS;
export const ATTRIBUTION = voxels.attribution;
