/**
 * Procedural site geometry, expressed as GeoJSON in real world coordinates so
 * MapLibre fill-extrusion layers can drape it onto the DEM terrain.
 */

export interface BuildSpec {
  turbines: number;
  pv_mw: number;
  batt_mwh: number;
}

type FC = GeoJSON.FeatureCollection<GeoJSON.Polygon, { kind: string }>;

const M_PER_DEG_LAT = 111_320;

function metersToLngLat(lat: number, lng: number, dxM: number, dyM: number): [number, number] {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return [lng + dxM / mPerDegLng, lat + dyM / M_PER_DEG_LAT];
}

/** Axis-aligned rectangle centred on a local metric offset, optionally rotated. */
function rect(
  lat: number,
  lng: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot = 0,
): GeoJSON.Polygon {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pts: [number, number][] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => metersToLngLat(lat, lng, cx + x * c - y * s, cy + x * s + y * c));
  pts.push(pts[0]);
  return { type: "Polygon", coordinates: [pts] };
}

function ngon(lat: number, lng: number, cx: number, cy: number, r: number, n = 8): GeoJSON.Polygon {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(metersToLngLat(lat, lng, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  pts.push(pts[0]);
  return { type: "Polygon", coordinates: [pts] };
}

/** Deterministic pseudo-random from a string seed. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function buildSiteGeoJSON(
  site: { id: string; latitude: number; longitude: number },
  build: BuildSpec,
): { halls: FC; batteries: FC; solar: FC; turbines: FC } {
  const { latitude: lat, longitude: lng } = site;
  const rnd = seeded(site.id);
  const rot = (rnd() - 0.5) * 0.8;

  const halls: FC = { type: "FeatureCollection", features: [] };
  for (let i = 0; i < 4; i++) {
    halls.features.push({
      type: "Feature",
      properties: { kind: "hall" },
      geometry: rect(lat, lng, (i - 1.5) * 62, 0, 44, 150, rot),
    });
  }

  const nBatt = Math.max(1, Math.min(72, Math.round(build.batt_mwh / 40)));
  const batteries: FC = { type: "FeatureCollection", features: [] };
  for (let i = 0; i < nBatt; i++) {
    const col = i % 12;
    const row = Math.floor(i / 12);
    batteries.features.push({
      type: "Feature",
      properties: { kind: "battery" },
      geometry: rect(lat, lng, (col - 5.5) * 16, -140 - row * 14, 12, 7, rot),
    });
  }

  const nRows = Math.max(1, Math.min(28, Math.round(build.pv_mw / 7)));
  const solar: FC = { type: "FeatureCollection", features: [] };
  for (let i = 0; i < nRows; i++) {
    solar.features.push({
      type: "Feature",
      properties: { kind: "solar" },
      geometry: rect(lat, lng, 30, -260 - i * 26, 520, 13, rot),
    });
  }

  const nTurb = Math.max(0, Math.min(80, Math.round(build.turbines)));
  const turbines: FC = { type: "FeatureCollection", features: [] };
  // Spiral of ~600 m spacing on the surrounding higher ground.
  for (let i = 0; i < nTurb; i++) {
    const ring = Math.floor(i / 8);
    const idx = i % 8;
    const r = 900 + ring * 620;
    const a = (idx / 8) * Math.PI * 2 + ring * 0.42 + rnd() * 0.12;
    turbines.features.push({
      type: "Feature",
      properties: { kind: "turbine" },
      geometry: ngon(lat, lng, Math.cos(a) * r, Math.sin(a) * r * 0.92, 16, 8),
    });
  }

  return { halls, batteries, solar, turbines };
}
