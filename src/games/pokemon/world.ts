// Tile grid from the OSM tilemap: walkability, nearest walkable tile, and area names.
import tilemap from '../../data/tilemap.json';
import { makeProjection } from '../../chaos/shared/geo';

export type Tile = '.' | ',' | ';' | '~' | '=' | '#' | 'D' | 'T' | 'P';

export interface Place {
  name: string;
  kind: string;
  x: number;
  y: number;
}

export const W = tilemap.width;
export const H = tilemap.height;
const rows = tilemap.rows;

// Kinds shown in the area banner (shops and cafes are too dense).
const AREA_KINDS = new Set(['building', 'court', 'green', 'bridge', 'street', 'water']);
const areas: Place[] = tilemap.names.filter((n) => AREA_KINDS.has(n.kind));

export function tile(x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= W || y >= H) return '#';
  return rows[y][x] as Tile;
}

export function walkable(x: number, y: number): boolean {
  const t = tile(x, y);
  return t !== '#' && t !== '~' && t !== 'D' && t !== 'T';
}

// Nearest walkable tile to (x, y), by breadth-first search over all tiles.
export function snap(x: number, y: number): { x: number; y: number } {
  if (walkable(x, y)) return { x, y };
  const seen = new Set<number>([y * W + x]);
  const queue = [[x, y]];
  for (let i = 0; i < queue.length; i++) {
    const [cx, cy] = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(ny * W + nx)) continue;
      if (walkable(nx, ny)) return { x: nx, y: ny };
      seen.add(ny * W + nx);
      queue.push([nx, ny]);
    }
  }
  return { x, y };
}

// Closest named area within maxDist tiles, or null.
export function nearestArea(x: number, y: number, maxDist = 7): Place | null {
  let best: Place | null = null;
  let bestD = maxDist * maxDist;
  for (const p of areas) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// Lon/lat to the tile containing it, using the tilemap's rotated, cropped frame.
const proj = makeProjection(tilemap.origin);
const rad = (tilemap.rotation * Math.PI) / 180;
export function fromLonLat(lon: number, lat: number): { x: number; y: number } {
  const [x, y] = proj.toXY(lon, lat);
  const { x0, y0 } = tilemap.crop;
  return {
    x: Math.floor((x * Math.cos(rad) - y * Math.sin(rad) - x0) / tilemap.tileSize),
    y: Math.floor((x * Math.sin(rad) + y * Math.cos(rad) - y0) / tilemap.tileSize),
  };
}

export const places: Place[] = tilemap.names;

export const attribution = tilemap.attribution;
