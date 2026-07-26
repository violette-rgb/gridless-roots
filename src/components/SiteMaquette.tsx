import { useMemo } from "react";
import type { BuildSpec } from "@/lib/site-model";
import type { Site } from "@/lib/offgrid-data";

/**
 * Compact isometric maquette of the campus — the same counts that drive the
 * map's fill-extrusion layers, drawn as a small SVG so the user can read the
 * whole build at a glance while the camera is deep in the terrain.
 */

const ISO_X = 0.86;
const ISO_Y = 0.5;

/** local metres -> svg point (isometric) */
function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * ISO_X, (x + y) * ISO_Y - z];
}

function box(
  cx: number,
  cy: number,
  w: number,
  d: number,
  h: number,
): { top: string; left: string; right: string } {
  const c = [
    iso(cx - w / 2, cy - d / 2, h),
    iso(cx + w / 2, cy - d / 2, h),
    iso(cx + w / 2, cy + d / 2, h),
    iso(cx - w / 2, cy + d / 2, h),
  ];
  const b = [
    iso(cx - w / 2, cy + d / 2, 0),
    iso(cx + w / 2, cy + d / 2, 0),
    iso(cx + w / 2, cy - d / 2, 0),
  ];
  const p = (pts: [number, number][]) => pts.map(([a, o]) => `${a.toFixed(1)},${o.toFixed(1)}`).join(" ");
  return {
    top: p(c),
    left: p([c[3], c[2], b[0], iso(cx - w / 2, cy + d / 2, 0)] as [number, number][]),
    right: p([c[2], c[1], b[2], b[1]] as [number, number][]),
  };
}

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

export function SiteMaquette({
  site,
  build,
  className = "",
}: {
  site: Site;
  build: BuildSpec;
  className?: string;
}) {
  const scene = useMemo(() => {
    const rnd = seeded(site.id);
    const S = 0.055; // metres -> svg units

    const halls = Array.from({ length: 4 }, (_, i) =>
      box((i - 1.5) * 62 * S, 0, 44 * S, 150 * S, 16),
    );

    const nBatt = Math.max(1, Math.min(48, Math.round(build.batt_mwh / 60)));
    const batteries = Array.from({ length: nBatt }, (_, i) => {
      const col = i % 8;
      const row = Math.floor(i / 8);
      return box((col - 3.5) * 22 * S, (-150 - row * 20) * S, 16 * S, 9 * S, 3.5);
    });

    const nRows = Math.max(1, Math.min(18, Math.round(build.pv_mw / 8)));
    const solar = Array.from({ length: nRows }, (_, i) => {
      const cx = 30 * S;
      const cy = (-270 - i * 34) * S;
      const w = 460 * S;
      const d = 12 * S;
      return [
        iso(cx - w / 2, cy - d / 2, 1.5),
        iso(cx + w / 2, cy - d / 2, 1.5),
        iso(cx + w / 2, cy + d / 2, 1.5),
        iso(cx - w / 2, cy + d / 2, 1.5),
      ]
        .map(([a, o]) => `${a.toFixed(1)},${o.toFixed(1)}`)
        .join(" ");
    });

    const nTurb = Math.max(0, Math.min(64, Math.round(build.turbines)));
    const turbines = Array.from({ length: nTurb }, (_, i) => {
      const ring = Math.floor(i / 8);
      const idx = i % 8;
      const r = (900 + ring * 620) * S;
      const a = (idx / 8) * Math.PI * 2 + ring * 0.42 + rnd() * 0.12;
      const [x, y] = iso(Math.cos(a) * r, Math.sin(a) * r * 0.92, 0);
      return { x, y, h: 26 };
    }).sort((a, b) => a.y - b.y);

    // Ground plate
    const R = 105;
    const plate = [iso(-R, 0), iso(0, -R), iso(R, 0), iso(0, R)]
      .map(([a, o]) => `${a.toFixed(1)},${o.toFixed(1)}`)
      .join(" ");

    return { halls, batteries, solar, turbines, plate };
  }, [site.id, build]);

  return (
    <svg viewBox="-190 -150 380 260" className={className} role="img" aria-label={`Campus maquette for ${site.nom}`}>
      <defs>
        <linearGradient id="mq-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22303f" />
          <stop offset="100%" stopColor="#131c26" />
        </linearGradient>
      </defs>

      <polygon points={scene.plate} fill="url(#mq-plate)" stroke="#3d5567" strokeWidth="0.6" />

      {/* solar field */}
      {scene.solar.map((p, i) => (
        <polygon key={`s${i}`} points={p} fill="#1b3a5c" stroke="#2b567f" strokeWidth="0.4" />
      ))}

      {/* batteries */}
      {scene.batteries.map((b, i) => (
        <g key={`b${i}`}>
          <polygon points={b.left} fill="#5d7286" />
          <polygon points={b.right} fill="#6a7f95" />
          <polygon points={b.top} fill="#8fa3b8" />
        </g>
      ))}

      {/* halls */}
      {scene.halls.map((b, i) => (
        <g key={`h${i}`}>
          <polygon points={b.right} fill="#7f8b9d" />
          <polygon points={b.top} fill="#c8cfe0" />
        </g>
      ))}

      {/* turbines */}
      {scene.turbines.map((t, i) => (
        <g key={`t${i}`} opacity="0.95">
          <line
            x1={t.x}
            y1={t.y}
            x2={t.x}
            y2={t.y - t.h}
            stroke="#e8edf5"
            strokeWidth="0.9"
          />
          <circle cx={t.x} cy={t.y - t.h} r="2.6" fill="none" stroke="#e8edf5" strokeWidth="0.7" />
        </g>
      ))}
    </svg>
  );
}
