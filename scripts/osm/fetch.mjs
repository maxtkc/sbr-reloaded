// Fetches an OSM extract around St John's from Overpass and writes src/data/osm.geojson.
// Usage: node scripts/osm/fetch.mjs [--cached]   (--cached reuses scripts/osm/out/raw.json)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// S, W, N, E: covers the rotated tilemap crop, Grange Road and the playing fields to All Saints Passage, Trinity Great Court to Northampton Street.
export const BBOX = [52.2042, 0.1042, 52.2134, 0.1212];

const OUT_DIR = new URL('./out/', import.meta.url);
const RAW = new URL('raw.json', OUT_DIR);
const GEOJSON = new URL('../../src/data/osm.geojson', import.meta.url);
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const b = BBOX.join(',');
const QUERY = `[out:json][timeout:180];
(
  nwr["building"](${b});
  nwr["building:part"](${b});
  way["highway"](${b});
  nwr["area:highway"](${b});
  nwr["landuse"](${b});
  nwr["leisure"](${b});
  nwr["natural"](${b});
  nwr["waterway"](${b});
  nwr["water"](${b});
  nwr["man_made"="bridge"](${b});
  node["entrance"](${b});
  node["name"]["amenity"](${b});
  node["name"]["tourism"](${b});
  node["name"]["shop"](${b});
  node["name"]["historic"](${b});
);
out geom;`;

const KEEP = [
  'name',
  'building',
  'building:part',
  'height',
  'building:levels',
  'min_height',
  'roof:shape',
  'roof:height',
  'highway',
  'area:highway',
  'width',
  'surface',
  'landuse',
  'leisure',
  'natural',
  'waterway',
  'water',
  'bridge',
  'man_made',
  'layer',
  'tunnel',
  'covered',
  'indoor',
  'entrance',
  'amenity',
  'tourism',
  'shop',
  'historic',
  'area',
];

// Tags that make a closed way an area rather than a ring-shaped line.
const AREA_KEYS = [
  'building',
  'building:part',
  'landuse',
  'leisure',
  'natural',
  'water',
  'area:highway',
  'amenity',
];

async function fetchRaw() {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: QUERY }),
        headers: { 'User-Agent': 'sbr-reloaded osm extract' },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn(`overpass ${url} failed: ${err.message}`);
    }
  }
  throw new Error('all Overpass endpoints failed');
}

const round = (n) => Math.round(n * 1e6) / 1e6;
const pt = (g) => [round(g.lon), round(g.lat)];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

function props(el) {
  const t = el.tags ?? {};
  const p = { osm_id: `${el.type}/${el.id}` };
  for (const k of KEEP) if (t[k] !== undefined) p[k] = t[k];
  if (t.building || t['building:part']) {
    const h = parseFloat(t.height);
    const lv = parseFloat(t['building:levels']);
    p.height_m = Number.isFinite(h) ? h : Number.isFinite(lv) ? Math.round(lv * 3.2 * 10) / 10 : 10;
  }
  return p;
}

function isArea(tags, coords) {
  if (coords.length < 4 || !same(coords[0], coords[coords.length - 1])) return false;
  if (tags.area === 'no') return false;
  if (tags.area === 'yes') return true;
  if (tags.highway || tags.waterway) return false;
  return AREA_KEYS.some((k) => tags[k] !== undefined) || tags.man_made === 'bridge';
}

// Joins way segments into closed rings by matching endpoints. Unclosable leftovers are dropped.
function stitch(segments) {
  const rings = [];
  const left = segments.filter((s) => s.length > 1).map((s) => s.slice());
  while (left.length) {
    let ring = left.shift();
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const s = left[i];
        const end = ring[ring.length - 1];
        if (same(end, s[0])) ring = ring.concat(s.slice(1));
        else if (same(end, s[s.length - 1])) ring = ring.concat(s.slice(0, -1).reverse());
        else if (same(ring[0], s[s.length - 1])) ring = s.slice(0, -1).concat(ring);
        else if (same(ring[0], s[0])) ring = s.slice(1).reverse().concat(ring);
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

// Even-odd point in ring test, used to assign inner rings to their outer.
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function relationGeometry(el) {
  const ways = (el.members ?? []).filter((m) => m.type === 'way' && m.geometry);
  const outers = stitch(ways.filter((m) => m.role !== 'inner').map((m) => m.geometry.map(pt)));
  const inners = stitch(ways.filter((m) => m.role === 'inner').map((m) => m.geometry.map(pt)));
  if (!outers.length) return null;
  const polys = outers.map((o) => [o]);
  for (const inner of inners) {
    const owner = polys.find((p) => inRing(inner[0], p[0]));
    if (owner) owner.push(inner);
  }
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };
}

function toFeature(el) {
  const tags = el.tags ?? {};
  let geometry = null;
  if (el.type === 'node') {
    geometry = { type: 'Point', coordinates: pt(el) };
  } else if (el.type === 'way' && el.geometry) {
    const coords = el.geometry.map(pt);
    geometry = isArea(tags, coords)
      ? { type: 'Polygon', coordinates: [coords] }
      : { type: 'LineString', coordinates: coords };
  } else if (el.type === 'relation' && tags.type === 'multipolygon') {
    geometry = relationGeometry(el);
  }
  return geometry && { type: 'Feature', properties: props(el), geometry };
}

const cached = process.argv.includes('--cached');
mkdirSync(OUT_DIR, { recursive: true });
const raw = cached && existsSync(RAW) ? JSON.parse(readFileSync(RAW, 'utf8')) : await fetchRaw();
if (!cached) writeFileSync(RAW, JSON.stringify(raw));

const seen = new Set();
const features = [];
for (const el of raw.elements) {
  const key = `${el.type}/${el.id}`;
  if (seen.has(key) || !el.tags) continue;
  seen.add(key);
  const f = toFeature(el);
  if (f) features.push(f);
}

const [s, w, n, e] = BBOX;
const out = {
  type: 'FeatureCollection',
  bbox: [w, s, e, n],
  origin: { lat: round((s + n) / 2), lon: round((w + e) / 2) },
  attribution: '(c) OpenStreetMap contributors, ODbL',
  fetched: raw.osm3s?.timestamp_osm_base ?? new Date().toISOString(),
  features: [],
};
// One feature per line keeps diffs readable.
const head = JSON.stringify(out).replace(/\[\]\}$/, '');
writeFileSync(GEOJSON, `${head}[\n${features.map((f) => JSON.stringify(f)).join(',\n')}\n]}\n`);

const counts = {};
for (const f of features) counts[f.geometry.type] = (counts[f.geometry.type] ?? 0) + 1;
console.log(`wrote ${features.length} features`, counts);
