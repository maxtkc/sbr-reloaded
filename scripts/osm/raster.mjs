// Rasterizes the OSM extract to a rotated tile grid. Shared by tilemap.mjs (4 m) and voxels.mjs (2 m).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { makeProjection } from '../../src/chaos/shared/geo.ts';

const GEOJSON = new URL('../../src/data/osm.geojson', import.meta.url);

export const T = {
  path: '.',
  grass: ',',
  tallgrass: ';',
  water: '~',
  road: '=',
  wall: '#',
  door: 'D',
  tree: 'T',
  pitch: 'P',
};
export const COLORS = {
  '.': [214, 200, 170],
  ',': [120, 180, 90],
  ';': [50, 120, 50],
  '~': [70, 130, 210],
  '=': [90, 90, 95],
  '#': [150, 60, 50],
  D: [250, 210, 60],
  T: [30, 80, 40],
  P: [150, 200, 110],
};

const GRASS = {
  landuse: ['grass', 'recreation_ground', 'village_green'],
  leisure: ['garden', 'pitch', 'park'],
};
const TALLGRASS = {
  natural: ['wood', 'scrub', 'grassland', 'heath'],
  landuse: ['meadow', 'flowerbed', 'forest'],
};
const ROADS = [
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'service',
  'living_street',
];
const PATHS = ['pedestrian', 'footway', 'path', 'cycleway', 'steps', 'bridleway', 'track'];
// Line half-widths in metres.
const WATERWAYS = { river: 8, stream: 2.4, canal: 6, drain: 2, ditch: 2 };
const ROAD_HALF = 4.8;
const SERVICE_HALF = 2.4;
const PEDESTRIAN_HALF = 4;
const FOOTWAY_HALF = 2;

// Frame: metres around origin rotated clockwise by rotateDeg, cropped to crop (rotated metres: x right, y down).
// Returns the grid (rows of legend chars), building heights in metres per tile, names and stats.
export function rasterize({ tile, origin, rotateDeg, crop }) {
  const geo = JSON.parse(readFileSync(GEOJSON, 'utf8'));
  const proj = makeProjection(origin);
  const cos = Math.cos((rotateDeg * Math.PI) / 180);
  const sin = Math.sin((rotateDeg * Math.PI) / 180);
  const width = Math.ceil((crop.x1 - crop.x0) / tile);
  const height = Math.ceil((crop.y1 - crop.y0) / tile);
  const grid = Array.from({ length: height }, () => Array(width).fill(T.path));
  const heights = Array.from({ length: height }, () => Array(width).fill(0));
  const m = (metres) => metres / tile;

  // Lon/lat to fractional tile coordinates.
  const toTile = ([lon, lat]) => {
    const [x, y] = proj.toXY(lon, lat);
    return [(x * cos - y * sin - crop.x0) / tile, (x * sin + y * cos - crop.y0) / tile];
  };
  const inGrid = (tx, ty) => tx >= 0 && ty >= 0 && tx < width && ty < height;
  const set = (tx, ty, ch) => inGrid(tx, ty) && (grid[ty][tx] = ch);
  const get = (tx, ty) => (inGrid(tx, ty) ? grid[ty][tx] : null);

  const matches = (p, table) => Object.entries(table).some(([k, vals]) => vals.includes(p[k]));
  const rings = (g) =>
    g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];

  // Even-odd scanline fill over all rings of a feature (holes included), sampled at tile centres.
  function fill(geometry, fn) {
    const rs = rings(geometry).map((r) => r.map(toTile));
    if (!rs.length) return;
    for (let ty = 0; ty < height; ty++) {
      const cy = ty + 0.5;
      const xs = [];
      for (const r of rs) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xa, ya] = r[i];
          const [xb, yb] = r[j];
          if (ya > cy !== yb > cy) xs.push(xa + ((cy - ya) * (xb - xa)) / (yb - ya));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (
          let tx = Math.max(0, Math.ceil(xs[k] - 0.5));
          tx < Math.min(width, xs[k + 1] - 0.5);
          tx++
        ) {
          fn(tx, ty);
        }
      }
    }
  }
  const fillPolygon = (geometry, ch) => fill(geometry, (tx, ty) => (grid[ty][tx] = ch));

  // Walks a line in quarter-tile steps, calling fn(tx, ty) on each tile within halfWidth of it.
  function walkLine(coords, halfWidth, fn) {
    const pts = coords.map(toTile);
    const r = Math.ceil(halfWidth);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
      for (let k = 0; k <= steps; k++) {
        const px = ax + ((bx - ax) * k) / steps;
        const py = ay + ((by - ay) * k) / steps;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const tx = Math.floor(px) + dx;
            const ty = Math.floor(py) + dy;
            if (Math.hypot(tx + 0.5 - px, ty + 0.5 - py) <= Math.max(halfWidth, 0.5)) fn(tx, ty);
          }
        }
      }
    }
  }

  const lines = (g) =>
    g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const strokeLine = (g, halfWidth, ch) =>
    lines(g).forEach((c) => walkLine(c, halfWidth, (x, y) => set(x, y, ch)));

  const F = geo.features;
  const P = (f) => f.properties;
  const isPassage = (p) =>
    p.tunnel === 'building_passage' || ((p.tunnel || p.covered === 'yes') && !p.waterway);
  const isBuilding = (p) => p.building && p.building !== 'roof' && p.layer !== '-1';

  // Paint order: later layers win.
  for (const f of F) if (matches(P(f), GRASS)) fillPolygon(f.geometry, T.grass);
  for (const f of F) if (P(f).leisure === 'pitch') fillPolygon(f.geometry, T.pitch);
  for (const f of F) if (matches(P(f), TALLGRASS)) fillPolygon(f.geometry, T.tallgrass);
  for (const f of F) {
    const p = P(f);
    if (p.natural === 'water' || p.water || p.waterway === 'riverbank')
      fillPolygon(f.geometry, T.water);
    if (WATERWAYS[p.waterway] && !p.tunnel)
      strokeLine(f.geometry, m(WATERWAYS[p.waterway]), T.water);
  }
  for (const f of F) {
    const p = P(f);
    if (ROADS.includes(p.highway) && !p.tunnel)
      strokeLine(f.geometry, m(p.highway === 'service' ? SERVICE_HALF : ROAD_HALF), T.road);
  }
  for (const f of F) {
    const p = P(f);
    if (p.man_made === 'bridge') fillPolygon(f.geometry, T.path);
    if (PATHS.includes(p.highway) && !isPassage(p))
      strokeLine(
        f.geometry,
        m(p.highway === 'pedestrian' ? PEDESTRIAN_HALF : FOOTWAY_HALF),
        T.path,
      );
    if (p['area:highway'] && PATHS.includes(p['area:highway'])) fillPolygon(f.geometry, T.path);
  }
  for (const f of F) {
    const p = P(f);
    if (!isBuilding(p)) continue;
    fillPolygon(f.geometry, T.wall);
    fill(f.geometry, (tx, ty) => (heights[ty][tx] = p.height_m ?? 10));
  }

  // Footways and passages are re-opened through walls (screens passages, gate arches), skipping indoor and
  // underground ways. The stroke is 4-connected so diagonal paths can be walked tile by tile.
  function carve(coords) {
    const pts = coords.map(toTile);
    let prev = null;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
      for (let k = 0; k <= steps; k++) {
        const tx = Math.floor(ax + ((bx - ax) * k) / steps);
        const ty = Math.floor(ay + ((by - ay) * k) / steps);
        if (prev && prev[0] !== tx && prev[1] !== ty) set(tx, prev[1], T.path);
        if (get(tx, ty) === T.wall || get(tx, ty) === T.door) set(tx, ty, T.path);
        prev = [tx, ty];
      }
    }
  }
  for (const f of F) {
    const p = P(f);
    const reopen =
      (PATHS.includes(p.highway) && !p.indoor && !(parseFloat(p.layer) < 0)) ||
      (ROADS.includes(p.highway) && isPassage(p));
    if (reopen) lines(f.geometry).forEach(carve);
  }
  // Footways often stop at a building edge on both sides of an unmapped passage; join loose ends close together.
  const ends = F.filter((f) => PATHS.includes(P(f).highway) && !P(f).indoor)
    .flatMap((f) => lines(f.geometry))
    .flatMap((c) => [c[0], c[c.length - 1]]);
  for (let i = 0; i < ends.length; i++) {
    const [ax, ay] = toTile(ends[i]);
    for (let j = i + 1; j < ends.length; j++) {
      const [bx, by] = toTile(ends[j]);
      const d = Math.hypot(bx - ax, by - ay);
      if (d > m(1.2) && d < m(10)) carve([ends[i], ends[j]]);
    }
  }

  // Trees go only on grass, so paths and courts stay open. Woods get a scatter away from paths.
  const soft = (c) => c === T.grass || c === T.tallgrass || c === T.pitch;
  const plant = (tx, ty) => soft(get(tx, ty)) && set(tx, ty, T.tree);
  let trees = 0;
  for (const f of F) {
    const p = P(f);
    if (p.natural === 'tree' && f.geometry.type === 'Point') {
      const [tx, ty] = toTile(f.geometry.coordinates);
      if (plant(Math.floor(tx), Math.floor(ty))) trees++;
    }
    if (p.natural === 'tree_row') {
      for (const c of lines(f.geometry)) {
        const pts = c.map(toTile);
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1];
          const [bx, by] = pts[i];
          const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / m(8)));
          for (let k = 0; k <= n; k++) {
            if (plant(Math.floor(ax + ((bx - ax) * k) / n), Math.floor(ay + ((by - ay) * k) / n)))
              trees++;
          }
        }
      }
    }
  }
  const woods = Array.from({ length: height }, () => Array(width).fill(false));
  for (const f of F) {
    if (P(f).natural === 'wood') fill(f.geometry, (tx, ty) => (woods[ty][tx] = true));
  }
  const nearPath = (tx, ty) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = get(tx + dx, ty + dy);
        if (c === T.path || c === T.road) return true;
      }
    return false;
  };
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (!woods[ty][tx] || nearPath(tx, ty)) continue;
      // Deterministic hash, about 1 in 4 tiles.
      if (((tx * 73856093) ^ (ty * 19349663)) % 4 === 0 && plant(tx, ty)) trees++;
    }
  }

  // Doors: entrance nodes snap to the nearest wall tile (within 8 m) that borders open ground.
  const borders = (tx, ty) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => {
      const c = get(tx + dx, ty + dy);
      return c && c !== T.wall && c !== T.door;
    });
  const reach = Math.round(m(8));
  let doors = 0;
  for (const f of F) {
    if (!P(f).entrance || f.geometry.type !== 'Point') continue;
    const [px, py] = toTile(f.geometry.coordinates);
    let best = null;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const tx = Math.floor(px) + dx;
        const ty = Math.floor(py) + dy;
        if (get(tx, ty) !== T.wall || !borders(tx, ty)) continue;
        const d = Math.hypot(tx + 0.5 - px, ty + 0.5 - py);
        if (!best || d < best.d) best = { tx, ty, d };
      }
    }
    if (best) {
      set(best.tx, best.ty, T.door);
      doors++;
    }
  }
  // A door with open ground on opposite sides is a passage through a thin wall.
  const open = (c) => c && c !== T.wall && c !== T.door && c !== T.water;
  let passages = 0;
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (get(tx, ty) !== T.door) continue;
      const across =
        (open(get(tx - 1, ty)) && open(get(tx + 1, ty))) ||
        (open(get(tx, ty - 1)) && open(get(tx, ty + 1)));
      if (across) {
        set(tx, ty, T.path);
        passages++;
      }
    }
  }

  // Names: buildings, courts, gardens, water and POIs at their tile; streets once each at the midpoint of the
  // longest way.
  function kindOf(p) {
    if (p.building) return 'building';
    if (p.landuse === 'college_court') return 'court';
    if (p.highway) return 'street';
    if (p.natural === 'water' || p.water || p.waterway) return 'water';
    if (p.leisure || p.landuse) return 'green';
    if (p.man_made === 'bridge') return 'bridge';
    return 'poi';
  }
  function anchor(g) {
    if (g.type === 'Point') return toTile(g.coordinates);
    const pts = (
      g.type === 'Polygon'
        ? g.coordinates[0]
        : g.type === 'MultiPolygon'
          ? g.coordinates[0][0]
          : g.coordinates
    ).map(toTile);
    if (g.type === 'LineString') return pts[Math.floor(pts.length / 2)];
    return [
      pts.reduce((a, q) => a + q[0], 0) / pts.length,
      pts.reduce((a, q) => a + q[1], 0) / pts.length,
    ];
  }
  const lineLength = (g) =>
    g.type === 'LineString'
      ? g.coordinates
          .map(toTile)
          .reduce(
            (a, q, i, arr) => a + (i ? Math.hypot(q[0] - arr[i - 1][0], q[1] - arr[i - 1][1]) : 0),
            0,
          )
      : 0;

  const names = [];
  const streets = new Map();
  for (const f of F) {
    const p = P(f);
    if (!p.name || p.entrance || p.natural === 'tree') continue;
    const kind = kindOf(p);
    const [ax, ay] = anchor(f.geometry);
    const x = Math.floor(ax);
    const y = Math.floor(ay);
    if (!inGrid(x, y)) continue;
    if (kind === 'street' || kind === 'water') {
      const len = lineLength(f.geometry);
      const prev = streets.get(p.name);
      if (!prev || len > prev.len)
        streets.set(p.name, { len, entry: { name: p.name, kind, x, y } });
    } else {
      names.push({ name: p.name, kind, x, y });
    }
  }
  names.push(...[...streets.values()].map((v) => v.entry));
  names.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  const legend = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));
  const counts = {};
  for (const r of grid) for (const c of r) counts[legend[c]] = (counts[legend[c]] ?? 0) + 1;
  // Tree-filled wall heights are dropped: only wall tiles keep a height.
  grid.forEach((r, ty) => r.forEach((c, tx) => c !== T.wall && (heights[ty][tx] = 0)));

  return {
    width,
    height,
    grid,
    heights,
    names,
    legend,
    toTile,
    attribution: geo.attribution,
    stats: { doors, passages, trees, names: names.length, counts },
  };
}

// Writes a debug PNG of the grid, scale px per tile, RGB, no filtering.
export function writePng(grid, file, scale = 4) {
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  }
  const pw = grid[0].length * scale;
  const ph = grid.length * scale;
  const raw = Buffer.alloc(ph * (pw * 3 + 1));
  for (let y = 0; y < ph; y++) {
    const row = y * (pw * 3 + 1);
    for (let x = 0; x < pw; x++)
      COLORS[grid[Math.floor(y / scale)][Math.floor(x / scale)]].forEach(
        (c, i) => (raw[row + 1 + x * 3 + i] = c),
      );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pw, 0);
  ihdr.writeUInt32BE(ph, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  mkdirSync(new URL('.', file), { recursive: true });
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
