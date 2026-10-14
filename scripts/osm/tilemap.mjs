// Rasterizes src/data/osm.geojson to a rotated 4 m tile grid: src/data/tilemap.json + scripts/osm/out/tilemap.png (debug).
// Usage: node scripts/osm/tilemap.mjs
import { writeFileSync } from 'node:fs';
import { rasterize, writePng } from './raster.mjs';

const TILE = 4;
const OUT = new URL('../../src/data/tilemap.json', import.meta.url);
const PNG = new URL('./out/tilemap.png', import.meta.url);

// Frame: metres around ORIGIN rotated clockwise by ROTATE_DEG (west up, north right, St John's courts square to the
// grid), cropped to CROP (rotated metres: x right, y down).
const ORIGIN = { lat: 52.2082, lon: 0.11475 };
const ROTATE_DEG = 61;
const CROP = { x0: -300, y0: -640, x1: 280, y1: 330 };

const r = rasterize({ tile: TILE, origin: ORIGIN, rotateDeg: ROTATE_DEG, crop: CROP });

const out = {
  tileSize: TILE,
  width: r.width,
  height: r.height,
  origin: ORIGIN,
  rotation: ROTATE_DEG,
  crop: CROP,
  attribution: r.attribution,
  legend: r.legend,
};
const head = JSON.stringify(out).slice(0, -1);
writeFileSync(
  OUT,
  `${head},"rows":[\n${r.grid.map((row) => JSON.stringify(row.join(''))).join(',\n')}\n],"names":[\n${r.names
    .map((v) => JSON.stringify(v))
    .join(',\n')}\n]}\n`,
);
writePng(r.grid, PNG);

const { doors, passages, trees, names, counts } = r.stats;
console.log(
  `${r.width}x${r.height} tiles, ${doors} doors (${passages} passages), ${trees} trees, ${names} names`,
  counts,
);
