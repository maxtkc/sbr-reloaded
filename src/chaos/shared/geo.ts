// Local metric projection for the OSM extract. Equirectangular around an origin: x metres east, y metres south.
// Plain erasable TS so the Node scripts in scripts/osm can import it directly.
export type LatLon = { lat: number; lon: number };

export type Projection = {
  toXY(lon: number, lat: number): [number, number];
  toLonLat(x: number, y: number): [number, number];
};

const R = 6371008.8;
const RAD = Math.PI / 180;

export function makeProjection(origin: LatLon): Projection {
  const kx = R * RAD * Math.cos(origin.lat * RAD);
  const ky = R * RAD;
  return {
    toXY: (lon, lat) => [(lon - origin.lon) * kx, (origin.lat - lat) * ky],
    toLonLat: (x, y) => [origin.lon + x / kx, origin.lat - y / ky],
  };
}
