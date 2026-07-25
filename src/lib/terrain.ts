/**
 * Deterministic terrain synthesis for the site-concept model.
 * Each site gets a plausible landform (fjord, moor, delta, plateau, coastal plain…)
 * derived from its latitude, longitude and a per-site relief character, so the
 * build layout has to respond to the ground instead of sitting on a flat disc.
 */

export type Landform =
  | "fjord"
  | "highland"
  | "moor"
  | "coastal-plain"
  | "delta"
  | "plateau"
  | "karst"
  | "steppe";

export interface TerrainProfile {
  landform: Landform;
  /** Vertical relief in metres across the 6 km × 6 km study square. */
  relief: number;
  /** 0 = smooth, 1 = broken and rocky. */
  ruggedness: number;
  /** true when one edge of the square is water. */
  coastal: boolean;
  note: string;
}

const PROFILES: Record<string, TerrainProfile> = {
  trondheim: {
    landform: "fjord",
    relief: 420,
    ruggedness: 0.85,
    coastal: true,
    note: "Fjord shoulder — turbines take the two ridge lines, halls sit on the graded bench above the waterline.",
  },
  reykjavik: {
    landform: "plateau",
    relief: 260,
    ruggedness: 0.7,
    coastal: true,
    note: "Basalt plateau cut by lava channels — a flat build pad, but foundations follow the rock benches.",
  },
  kiruna: {
    landform: "highland",
    relief: 340,
    ruggedness: 0.6,
    coastal: false,
    note: "Fell highland — the exposed summit belt takes the rotors, the sheltered basin takes the halls.",
  },
  caithness: {
    landform: "moor",
    relief: 180,
    ruggedness: 0.45,
    coastal: true,
    note: "Peat moor over sandstone — long low swells, so rotors spread wide instead of stacking on a ridge.",
  },
  dublin: {
    landform: "moor",
    relief: 150,
    ruggedness: 0.4,
    coastal: true,
    note: "Drumlin farmland rising inland — rotors on the drumlin crests, PV on the seaward slope.",
  },
  frankfurt: {
    landform: "plateau",
    relief: 120,
    ruggedness: 0.3,
    coastal: false,
    note: "Rhine terrace — gentle, agricultural, almost no grading required for the compute halls.",
  },
  seville: {
    landform: "steppe",
    relief: 130,
    ruggedness: 0.35,
    coastal: false,
    note: "Guadalquivir dry steppe — the solar field dominates, spread across the open southern slopes.",
  },
  ordos: {
    landform: "steppe",
    relief: 170,
    ruggedness: 0.4,
    coastal: false,
    note: "Loess steppe with shifting dune ridges — turbines on stabilised ridges, PV on the pans between.",
  },
  "a-coruna": {
    landform: "coastal-plain",
    relief: 200,
    ruggedness: 0.55,
    coastal: true,
    note: "Granite headland — rotors on the seaward brow where the gradient wind lands first.",
  },
  brest: {
    landform: "coastal-plain",
    relief: 160,
    ruggedness: 0.5,
    coastal: true,
    note: "Armorican coast — low rocky spurs, rotors on the exposed capes, halls set back from spray.",
  },
  sines: {
    landform: "coastal-plain",
    relief: 110,
    ruggedness: 0.3,
    coastal: true,
    note: "Atlantic terrace above the cliffs — flat enough that the solar field sets the geometry.",
  },
  foggia: {
    landform: "karst",
    relief: 240,
    ruggedness: 0.6,
    coastal: false,
    note: "Tavoliere karst — limestone swells and sinkholes; the pad avoids the dolines entirely.",
  },
  heraklion: {
    landform: "karst",
    relief: 300,
    ruggedness: 0.75,
    coastal: true,
    note: "Coastal limestone ridge — rotors on the crest, solar terraced down the south face.",
  },
  narva: {
    landform: "coastal-plain",
    relief: 90,
    ruggedness: 0.25,
    coastal: true,
    note: "Baltic glint plain — flat, forested, a single low escarpment behind the build pad.",
  },
  esbjerg: {
    landform: "delta",
    relief: 60,
    ruggedness: 0.2,
    coastal: true,
    note: "Wadden marsh — everything sits on engineered fill; rotors follow the dyke line.",
  },
  gdansk: {
    landform: "delta",
    relief: 100,
    ruggedness: 0.3,
    coastal: true,
    note: "Vistula delta with a moraine edge — soft ground seaward, foundations on the moraine.",
  },
  oulu: {
    landform: "moor",
    relief: 80,
    ruggedness: 0.3,
    coastal: true,
    note: "Ostrobothnian mire — near-level bog, rotor pads on gravel islands.",
  },
  eemshaven: {
    landform: "delta",
    relief: 45,
    ruggedness: 0.15,
    coastal: true,
    note: "Reclaimed polder — the flattest site in the set; the dyke is the only landform.",
  },
};

const FALLBACK: TerrainProfile = {
  landform: "coastal-plain",
  relief: 160,
  ruggedness: 0.45,
  coastal: true,
  note: "Rolling ground with one exposed brow — rotors on the high line, halls on the level bench.",
};

export function terrainFor(id: string, latitude: number): TerrainProfile {
  const p = PROFILES[id];
  if (p) return p;
  // Higher latitudes in this set skew rockier.
  return { ...FALLBACK, relief: FALLBACK.relief + (Math.abs(latitude) - 45) * 3 };
}

/* ---------- deterministic value-noise heightfield ---------- */

function hash(x: number, y: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (
    a * (1 - xf) * (1 - yf) + b * xf * (1 - yf) + c * (1 - xf) * yf + d * xf * yf
  );
}

export function seedOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h;
}

/**
 * Height at normalised coordinates (u, v) in [-1, 1], returned in [0, 1].
 * Landform shapes the low-frequency structure; ruggedness the octave weighting.
 */
export function heightAt(
  u: number,
  v: number,
  t: TerrainProfile,
  seed: number,
): number {
  const fbm = (f: number, oct: number) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * valueNoise(u * f + 8, v * f + 8, seed + o * 13);
      norm += amp;
      amp *= 0.42 + t.ruggedness * 0.22;
      f *= 2.05;
    }
    return sum / norm;
  };

  const detail = fbm(3.2, t.ruggedness > 0.5 ? 5 : 3);
  let base: number;

  switch (t.landform) {
    case "fjord": {
      // Deep U-shaped trough running along v, steep flanks.
      const trough = Math.min(1, Math.abs(u + 0.15) * 1.9);
      base = Math.pow(trough, 0.75) * (0.75 + 0.25 * fbm(1.4, 2));
      break;
    }
    case "highland": {
      const dome = 1 - Math.min(1, Math.hypot(u * 0.9, v * 1.1));
      base = 0.25 + Math.pow(Math.max(0, dome), 0.8) * 0.75;
      break;
    }
    case "karst": {
      const swell = 0.45 + 0.4 * fbm(1.6, 3);
      const doline = Math.pow(fbm(5.5, 2), 3) * 0.55;
      base = swell - doline;
      break;
    }
    case "plateau": {
      const edge = Math.min(1, (1.05 - Math.abs(v)) * 3);
      base = 0.25 + Math.pow(Math.max(0, edge), 0.6) * 0.5;
      break;
    }
    case "moor": {
      base = 0.28 + fbm(1.7, 3) * 0.5;
      break;
    }
    case "coastal-plain": {
      // Rises inland (v -> +1), water at v = -1.
      base = Math.max(0, (v + 0.9) / 1.9) ** 1.25 * 0.85 + 0.1;
      break;
    }
    case "delta": {
      const dyke = Math.exp(-Math.pow((v + 0.55) * 5.5, 2)) * 0.45;
      base = 0.16 + dyke + fbm(2.2, 2) * 0.14;
      break;
    }
    case "steppe":
    default: {
      const ridges = Math.abs(Math.sin((u * 1.6 + v * 0.5) * 2.1)) * 0.35;
      base = 0.22 + ridges + fbm(2.4, 3) * 0.3;
      break;
    }
  }

  const h = base * (1 - 0.32 * t.ruggedness) + detail * (0.18 + 0.32 * t.ruggedness);
  return Math.max(0, Math.min(1, h));
}

export function slopeAt(u: number, v: number, t: TerrainProfile, seed: number) {
  const e = 0.035;
  const dx = heightAt(u + e, v, t, seed) - heightAt(u - e, v, t, seed);
  const dy = heightAt(u, v + e, t, seed) - heightAt(u, v - e, t, seed);
  return Math.hypot(dx, dy) / (2 * e);
}

/** Water level as a fraction of relief, or null when the site is inland. */
export function waterLevel(t: TerrainProfile) {
  if (!t.coastal) return null;
  return t.landform === "fjord" ? 0.06 : 0.05;
}
