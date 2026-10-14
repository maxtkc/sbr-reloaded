// Rasterizes src/data/osm.geojson to a 2 m grid around St John's for the Minecraft voxel world:
// src/data/voxels.json + scripts/osm/out/voxels.png (debug).
// Usage: node scripts/osm/voxels.mjs
import { writeFileSync } from 'node:fs';
import { rasterize, writePng } from './raster.mjs';

const TILE = 2;
// Vertical metres per block (buildings read better a bit taller than 2 m blocks).
const BLOCK_HEIGHT = 1.5;
const OUT = new URL('../../src/data/voxels.json', import.meta.url);
const PNG = new URL('./out/voxels.png', import.meta.url);

// Same frame as tilemap.mjs, cropped to 400 m around St John's: New Court and the Backs to All Saints Passage,
// Trinity to Magdalene Bridge.
const ORIGIN = { lat: 52.2082, lon: 0.11475 };
const ROTATE_DEG = 61;
const CROP = { x0: -120, y0: -100, x1: 280, y1: 300 };
// Spawn: First Court, outside the SBR (same point as the Pokemon start).
const SPAWN = [0.117543, 52.207944];
const KINDS = ['building', 'court', 'bridge', 'street', 'water', 'green'];

const r = rasterize({ tile: TILE, origin: ORIGIN, rotateDeg: ROTATE_DEG, crop: CROP });
// Building height in blocks as one base-36 char per tile, '0' for no building.
const heights = r.heights.map((row) =>
  row
    .map((h) => (h ? Math.min(35, Math.max(3, Math.round(h / BLOCK_HEIGHT))).toString(36) : '0'))
    .join(''),
);
const [sx, sy] = r.toTile(SPAWN);
const out = {
  tileSize: TILE,
  blockHeight: BLOCK_HEIGHT,
  width: r.width,
  height: r.height,
  origin: ORIGIN,
  rotation: ROTATE_DEG,
  crop: CROP,
  attribution: r.attribution,
  legend: r.legend,
  spawn: [Math.floor(sx), Math.floor(sy)],
};
const names = r.names.filter((n) => KINDS.includes(n.kind));
const list = (a) => a.map((v) => JSON.stringify(v)).join(',\n');
writeFileSync(
  OUT,
  `${JSON.stringify(out).slice(0, -1)},"rows":[\n${list(r.grid.map((row) => row.join('')))}\n],` +
    `"heights":[\n${list(heights)}\n],"names":[\n${list(names)}\n]}\n`,
);
writePng(r.grid, PNG);

const { doors, trees, counts } = r.stats;
console.log(
  `${r.width}x${r.height} tiles, spawn ${out.spawn}, ${doors} doors, ${trees} trees, ${names.length} names`,
  counts,
);
