// Converts src/data/osm.geojson into compact local-metre geometry for the flight sim: src/data/flight.json.
// Coordinates are [x, z] in metres around the extract origin (x east, z south), rounded to 0.5 m.
// Usage: node scripts/osm/flight.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { makeProjection } from '../../src/chaos/shared/geo.ts';

const GEOJSON = new URL('../../src/data/osm.geojson', import.meta.url);
const OUT = new URL('../../src/data/flight.json', import.meta.url);

// Default heights in metres by building type when OSM has none.
const TYPE_HEIGHT = {
  house: 8,
  terrace: 9,
  detached: 8,
  semidetached_house: 8,
  garage: 3,
  shed: 3,
  retail: 11,
  commercial: 12,
  office: 13,
  apartments: 14,
  residential: 12,
  university: 14,
  college: 14,
  school: 12,
  church: 18,
  chapel: 18,
  cathedral: 30,
};
const DEFAULT_HEIGHT = 11;
// Hand-set heights by name (OSM has few heights here).
const NAME_HEIGHT = {
  "St John's College Chapel": 24,
  'Trinity College Chapel': 22,
  "King's College Chapel": 29,
  'Magdalene College Chapel': 16,
  "St Clement's Church": 20,
  'Round Church': 14,
  'Holy Sepulchre Church': 14,
};
// Building type -> colour class for the game: stone (colleges, churches), brick (houses), shop (retail).
const TYPE_CLASS = {
  house: 'brick',
  terrace: 'brick',
  detached: 'brick',
  semidetached_house: 'brick',
  apartments: 'brick',
  residential: 'brick',
  garage: 'brick',
  shed: 'brick',
  retail: 'shop',
  commercial: 'shop',
  office: 'shop',
};
const AREA_KIND = [
  ['water', (p) => p.natural === 'water' || p.waterway === 'riverbank'],
  ['wood', (p) => ['wood', 'scrub'].includes(p.natural) || p.landuse === 'forest'],
  ['pitch', (p) => p.leisure === 'pitch'],
  [
    'grass',
    (p) =>
      ['grass', 'recreation_ground', 'village_green', 'meadow', 'flowerbed'].includes(p.landuse) ||
      ['garden', 'park'].includes(p.leisure),
  ],
  ['court', (p) => p.landuse === 'college_court'],
  ['town', (p) => ['residential', 'retail', 'commercial'].includes(p.landuse)],
];
// Line half-widths in metres.
const WATER_HALF = { river: 9, stream: 2.5, canal: 6, drain: 1.5 };
const ROAD_HALF = {
  primary: 5,
  secondary: 5,
  tertiary: 4.5,
  unclassified: 4,
  residential: 4,
  living_street: 3.5,
  service: 2.5,
  pedestrian: 3.5,
  footway: 1,
  path: 1,
  cycleway: 1.2,
};
// Landmark markers: lon/lat or a named OSM feature's centroid, plus a fact key read by the game.
const MARKERS = [
  { id: 'sbr', name: 'SBR', lonlat: [0.11767, 52.207681] },
  { id: 'gsr', name: 'GSR', lonlat: [0.119255, 52.207801] },
  { id: 'chapel', name: 'Chapel', feature: "St John's College Chapel" },
  { id: 'bridge', name: 'Bridge of Sighs', feature: 'Bridge of Sighs', prop: 'man_made' },
  { id: 'gate', name: 'Great Gate', lonlat: [0.117864, 52.207821] },
];
// Square towers added on top of named buildings (OSM maps the chapel as one outline): side and height in metres,
// aligned with the building's longest edge, at its centroid.
const TOWERS = [{ feature: "St John's College Chapel", side: 13, h: 50 }];
// Start point and heading (degrees clockwise from north): over the Backs, flying east toward First Court.
const START = { lonlat: [0.1125, 52.2083], heading: 80, alt: 60 };

const geo = JSON.parse(readFileSync(GEOJSON, 'utf8'));
const proj = makeProjection(geo.origin);
const [w, s, e, n] = geo.bbox;
const [bx0, bz1] = proj.toXY(w, s);
const [bx1, bz0] = proj.toXY(e, n);
const r2 = (v) => Math.round(v * 2) / 2;
const xy = ([lon, lat]) => proj.toXY(lon, lat).map(r2);
const inside = ([x, z]) => x >= bx0 - 50 && x <= bx1 + 50 && z >= bz0 - 50 && z <= bz1 + 50;

const polys = (g) =>
  g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const lines = (g) =>
  g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];

// Projects a line, dropping repeated points.
function path(coords) {
  const out = [];
  for (const c of coords) {
    const p = xy(c);
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

// Projects a ring, dropping repeated points and the closing point.
function ring(coords) {
  const out = path(coords);
  if (out.length > 1 && out[0][0] === out.at(-1)[0] && out[0][1] === out.at(-1)[1]) out.pop();
  return out;
}

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

function buildingHeight(p) {
  if (NAME_HEIGHT[p.name]) return NAME_HEIGHT[p.name];
  const h = parseFloat(p.height);
  if (h > 0) return h;
  const lv = parseFloat(p['building:levels']);
  if (lv > 0) return lv * 3.2 + 1.5;
  const base = TYPE_HEIGHT[p.building] ?? DEFAULT_HEIGHT;
  // Deterministic jitter so the skyline is not flat.
  return base * (0.85 + 0.35 * hash(p.osm_id));
}

const buildings = [];
const areas = [];
const ribbons = [];
const counts = {};
for (const f of geo.features) {
  const p = f.properties;
  const g = f.geometry;
  if (p.building && p.building !== 'roof' && !p.indoor) {
    for (const rs of polys(g)) {
      const rings = rs.map(ring).filter((r) => r.length >= 3);
      if (!rings.length || !rings[0].some(inside)) continue;
      buildings.push({
        r: rings,
        h: Math.round(buildingHeight(p) * 2) / 2,
        c: TYPE_CLASS[p.building] ?? 'stone',
      });
    }
    continue;
  }
  const kind = AREA_KIND.find(([, test]) => test(p))?.[0];
  if (kind && g.type !== 'Point' && g.type !== 'LineString') {
    for (const rs of polys(g)) {
      const rings = rs.map(ring).filter((r) => r.length >= 3);
      if (!rings.length || !rings[0].some(inside)) continue;
      areas.push({ k: kind, r: rings });
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    continue;
  }
  const isWater = WATER_HALF[p.waterway] && p.tunnel !== 'culvert' && p.layer !== '-1';
  const roadHalf = ROAD_HALF[p.highway];
  if ((isWater || roadHalf) && !p.tunnel && p.indoor !== 'yes') {
    const k = isWater ? 'water' : roadHalf >= 2.5 ? 'road' : 'path';
    for (const c of lines(g)) {
      const pts = path(c);
      if (pts.length < 2 || !pts.some(inside)) continue;
      ribbons.push({ k, w: (isWater ? WATER_HALF[p.waterway] : roadHalf) * 2, p: pts });
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
}

// Area centroid of a polygon's outer ring.
function centroid(r) {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const k = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += k;
    cx += (r[j][0] + r[i][0]) * k;
    cz += (r[j][1] + r[i][1]) * k;
  }
  return [r2(cx / (3 * a)), r2(cz / (3 * a))];
}

const markers = MARKERS.map((m) => {
  let pos;
  if (m.lonlat) pos = xy(m.lonlat);
  else {
    const f = namedPolygon(m.feature, m.prop);
    if (!f) throw new Error(`marker feature not found: ${m.feature}`);
    pos = centroid(ring(polys(f.geometry)[0][0]));
  }
  return { id: m.id, name: m.name, x: pos[0], z: pos[1] };
});

// First polygon feature with this name (and a prop key, if given).
function namedPolygon(name, prop) {
  return geo.features.find(
    (x) =>
      x.properties.name === name &&
      (x.geometry.type === 'Polygon' || x.geometry.type === 'MultiPolygon') &&
      (!prop || x.properties[prop]),
  );
}

for (const t of TOWERS) {
  const f = namedPolygon(t.feature);
  if (!f) throw new Error(`tower feature not found: ${t.feature}`);
  const r = ring(polys(f.geometry)[0][0]);
  const [cx, cz] = centroid(r);
  let angle = 0;
  let longest = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const len = Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]);
    if (len > longest) {
      longest = len;
      angle = Math.atan2(r[i][1] - r[j][1], r[i][0] - r[j][0]);
    }
  }
  const half = t.side / 2;
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ].map(([u, v]) => [
    r2(cx + u * Math.cos(angle) - v * Math.sin(angle)),
    r2(cz + u * Math.sin(angle) + v * Math.cos(angle)),
  ]);
  buildings.push({ r: [corners], h: t.h, c: 'stone' });
}

const [sx, sz] = xy(START.lonlat);
const out = {
  origin: geo.origin,
  bounds: [r2(bx0), r2(bz0), r2(bx1), r2(bz1)],
  attribution: geo.attribution,
  start: { x: sx, z: sz, heading: START.heading, alt: START.alt },
  markers,
  areas,
  ribbons,
  buildings,
};
// One feature per line keeps diffs readable.
const json =
  '{' +
  Object.entries(out)
    .map(([k, v]) =>
      Array.isArray(v) && typeof v[0] === 'object'
        ? `"${k}":[\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]`
        : `"${k}":${JSON.stringify(v)}`,
    )
    .join(',\n') +
  '}\n';
writeFileSync(OUT, json);
console.log(
  `buildings ${buildings.length}, areas ${areas.length}, ribbons ${ribbons.length}`,
  counts,
  `${(json.length / 1024).toFixed(0)} kB`,
);
