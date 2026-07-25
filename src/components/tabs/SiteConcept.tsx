import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Group } from "three";
import * as THREE from "three";
import {
  heightAt,
  seedOf,
  slopeAt,
  terrainFor,
  waterLevel,
  type TerrainProfile,
} from "@/lib/terrain";

const SQUARE = 120; // world units across the 6 km study square
const GRID = 160; // mesh resolution

function reliefUnits(t: TerrainProfile) {
  // 6 km across = 120 units, exaggerate vertical by 2.4 for legibility
  return (t.relief / 6000) * SQUARE * 2.4;
}

/* ---------------- topographic texture ---------------- */

function useTopoTexture(t: TerrainProfile, seed: number) {
  return useMemo(() => {
    const N = 512;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(N, N);
    const wl = waterLevel(t);
    const bands = 16;

    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        h[y * N + x] = heightAt((x / (N - 1)) * 2 - 1, (y / (N - 1)) * 2 - 1, t, seed);
      }
    }

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const v = h[i];
        const band = Math.floor(v * bands);
        const right = x < N - 1 ? Math.floor(h[i + 1] * bands) : band;
        const down = y < N - 1 ? Math.floor(h[i + N] * bands) : band;
        const isContour = band !== right || band !== down;
        const major = band % 4 === 0;

        // base hypsometric tint: near-black lowlands to cool slate highs
        let r = 10 + v * 26;
        let g = 15 + v * 34;
        let b = 22 + v * 44;

        if (wl !== null && v < wl) {
          r = 6;
          g = 16;
          b = 28;
        } else if (isContour) {
          const k = major ? 1 : 0.45;
          r += 46 * k;
          g += 104 * k;
          b += 126 * k;
        }

        const o = i * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // survey grid overlay
    ctx.strokeStyle = "rgba(127, 214, 242, 0.10)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const p = (i / 6) * N;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, N);
      ctx.moveTo(0, p);
      ctx.lineTo(N, p);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [t, seed]);
}

/* ---------------- terrain mesh ---------------- */

function Terrain({ t, seed }: { t: TerrainProfile; seed: number }) {
  const tex = useTopoTexture(t, seed);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(SQUARE, SQUARE, GRID, GRID);
    const pos = g.attributes.position;
    const amp = reliefUnits(t);
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) / (SQUARE / 2));
      const v = -(pos.getY(i) / (SQUARE / 2));
      pos.setZ(i, heightAt(u, v, t, seed) * amp);
    }
    g.computeVertexNormals();
    return g;
  }, [t, seed]);

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <meshStandardMaterial map={tex} roughness={0.95} metalness={0} />
    </mesh>
  );
}

/* ---------------- site elements ---------------- */

function Turbine({
  position,
  hub,
  phase,
}: {
  position: [number, number, number];
  hub: number;
  phase: number;
}) {
  const rotor = useRef<Group>(null);
  useFrame((_, d) => {
    if (rotor.current) rotor.current.rotation.z += d * 0.55;
  });
  const blade = hub * 0.42;
  return (
    <group position={position}>
      <mesh position={[0, hub / 2, 0]}>
        <cylinderGeometry args={[0.055, 0.11, hub, 8]} />
        <meshStandardMaterial color="#dbe3f5" emissive="#7fb6d8" emissiveIntensity={0.5} />
      </mesh>
      <group ref={rotor} position={[0, hub, 0.16]} rotation={[0, 0, phase]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, blade / 2, 0]}>
            <boxGeometry args={[0.07, blade, 0.03]} />
            <meshStandardMaterial color="#eef3ff" emissive="#8fd8f2" emissiveIntensity={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

interface Placed {
  turbines: { x: number; z: number; y: number }[];
  pv: { x: number; z: number; y: number }[];
  pad: { x: number; z: number; y: number };
  padAngle: number;
}

function place(
  t: TerrainProfile,
  seed: number,
  nTurb: number,
  nPv: number,
): Placed {
  const amp = reliefUnits(t);
  const wl = waterLevel(t);
  const R = 34;
  type Cell = { u: number; v: number; h: number; s: number };
  const cells: Cell[] = [];
  for (let iy = 0; iy < R; iy++) {
    for (let ix = 0; ix < R; ix++) {
      const jx = ((seed * (ix + 3) * 7919) % 1000) / 1000 - 0.5;
      const jz = ((seed * (iy + 5) * 6151) % 1000) / 1000 - 0.5;
      const u = ((ix + 0.5 + jx * 0.55) / R) * 2 - 1;
      const v = ((iy + 0.5 + jz * 0.55) / R) * 2 - 1;
      if (Math.abs(u) > 0.94 || Math.abs(v) > 0.94) continue;
      const h = heightAt(u, v, t, seed);
      if (wl !== null && h < wl + 0.015) continue; // no building in water
      cells.push({ u, v, h, s: slopeAt(u, v, t, seed) });
    }
  }

  const toWorld = (c: { u: number; v: number; h: number }) => ({
    x: c.u * (SQUARE / 2),
    z: c.v * (SQUARE / 2),
    y: c.h * amp,
  });

  // Turbines: highest, wind-exposed ground, respecting 5-rotor-diameter spacing.
  const turbines: { x: number; z: number; y: number }[] = [];
  const minSpacing = Math.max(4.6, 13 - nTurb * 0.06);
  const ranked = [...cells].sort((a, b) => b.h + b.s * 0.12 - (a.h + a.s * 0.12));
  for (const c of ranked) {
    if (turbines.length >= nTurb) break;
    if (c.s > 0.65) continue; // too steep to erect
    const w = toWorld(c);
    if (turbines.some((p) => Math.hypot(p.x - w.x, p.z - w.z) < minSpacing)) continue;
    turbines.push(w);
  }

  // PV: gentle slopes at low/mid elevation, biased to south-facing ground.
  const pv: { x: number; z: number; y: number }[] = [];
  const flat = cells
    .filter((c) => c.s < 0.3 && c.h < 0.72)
    .map((c) => {
      const grad =
        heightAt(c.u, c.v + 0.04, t, seed) - heightAt(c.u, c.v - 0.04, t, seed);
      return { c, score: c.s * 3 - grad * 2 };
    })
    .sort((a, b) => a.score - b.score);
  for (const f of flat) {
    if (pv.length >= nPv) break;
    const w = toWorld(f.c);
    if (turbines.some((p) => Math.hypot(p.x - w.x, p.z - w.z) < 3)) continue;
    if (pv.some((p) => Math.hypot(p.x - w.x, p.z - w.z) < 3.1)) continue;
    pv.push(w);
  }

  // Build pad: flattest accessible ground, low and near the middle.
  const padCell =
    [...cells]
      .filter((c) => Math.abs(c.u) < 0.6 && Math.abs(c.v) < 0.6)
      .sort((a, b) => a.s - b.s || a.h - b.h)[0] ?? cells[0];
  const pad = toWorld(padCell);
  const gx =
    heightAt(padCell.u + 0.04, padCell.v, t, seed) -
    heightAt(padCell.u - 0.04, padCell.v, t, seed);
  const gz =
    heightAt(padCell.u, padCell.v + 0.04, t, seed) -
    heightAt(padCell.u, padCell.v - 0.04, t, seed);
  const padAngle = Math.atan2(gz, gx);

  return { turbines, pv, pad, padAngle };
}

function Scene({
  siteId,
  latitude,
  turbines,
  pv,
  batt,
  pIt,
}: {
  siteId: string;
  latitude: number;
  turbines: number;
  pv: number;
  batt: number;
  pIt: number;
}) {
  const rig = useRef<Group>(null);
  useFrame((_, d) => {
    if (rig.current) rig.current.rotation.y += d * 0.035;
  });

  const t = useMemo(() => terrainFor(siteId, latitude), [siteId, latitude]);
  const seed = useMemo(() => seedOf(siteId), [siteId]);
  const nPv = Math.min(46, Math.max(0, Math.round(pv / 9)));
  const layout = useMemo(
    () => place(t, seed, Math.round(turbines), nPv),
    [t, seed, turbines, nPv],
  );

  const battUnits = Math.min(30, Math.max(1, Math.round(batt / 100)));
  const halls = Math.max(2, Math.round(pIt / 10));
  const wl = waterLevel(t);
  const amp = reliefUnits(t);
  const tilt = THREE.MathUtils.degToRad(Math.min(40, Math.max(15, Math.abs(latitude) * 0.62)));
  const hub = 4 + t.ruggedness * 0.8;

  return (
    <>
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#9fdcf2", "#0a0e18", 0.9]} />
      <directionalLight position={[-40, 46, 26]} intensity={1.5} color="#cfe9f7" />

      <group ref={rig}>
        <Terrain t={t} seed={seed} />

        {wl !== null && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, wl * amp + 0.06, 0]}>
            <planeGeometry args={[SQUARE * 1.02, SQUARE * 1.02]} />
            <meshStandardMaterial
              color="#0b1c2c"
              emissive="#1d6f96"
              emissiveIntensity={0.28}
              transparent
              opacity={0.88}
            />
          </mesh>
        )}

        {/* compute halls + substation on the graded pad */}
        <group position={[layout.pad.x, layout.pad.y, layout.pad.z]} rotation={[0, layout.padAngle, 0]}>
          <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[16, 13]} />
            <meshStandardMaterial color="#151d28" roughness={1} />
          </mesh>
          {Array.from({ length: halls }).map((_, i) => (
            <mesh
              key={i}
              position={[-5.6 + (i % 3) * 4.4, 0.85, -3.6 + Math.floor(i / 3) * 4.2]}
            >
              <boxGeometry args={[3.4, 1.5, 3.4]} />
              <meshStandardMaterial
                color="#e4e8f6"
                emissive="#93a4e0"
                emissiveIntensity={0.55}
                roughness={0.5}
              />
            </mesh>
          ))}
          {Array.from({ length: battUnits }).map((_, i) => (
            <mesh
              key={`b${i}`}
              position={[-6 + (i % 6) * 1.5, 0.42, 4.4 + Math.floor(i / 6) * 1.1]}
            >
              <boxGeometry args={[1.2, 0.7, 0.72]} />
              <meshStandardMaterial
                color="#c6d3ea"
                emissive="#6fb0d0"
                emissiveIntensity={0.45}
              />
            </mesh>
          ))}
        </group>

        {/* solar field, terraced onto low-slope ground */}
        {layout.pv.map((p, i) => (
          <group key={`pv${i}`} position={[p.x, p.y + 0.35, p.z]}>
            {[-0.9, 0.9].map((o) => (
              <mesh key={o} position={[o, 0, 0]} rotation={[-tilt, 0, 0]}>
                <planeGeometry args={[1.5, 1.25]} />
                <meshStandardMaterial
                  color="#12293c"
                  emissive="#3ea6d8"
                  emissiveIntensity={0.45}
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))}
          </group>
        ))}

        {layout.turbines.map((p, i) => (
          <Turbine
            key={`t${i}`}
            position={[p.x, p.y, p.z]}
            hub={hub}
            phase={(i * 1.7) % Math.PI}
          />
        ))}
      </group>

      <OrbitControls
        enablePan={false}
        minDistance={40}
        maxDistance={190}
        maxPolarAngle={Math.PI / 2.25}
      />
    </>
  );
}

export default function SiteConcept(props: {
  siteId: string;
  latitude: number;
  turbines: number;
  pv: number;
  batt: number;
  pIt: number;
  heightClass?: string;
}) {
  const { heightClass = "h-[460px]", ...scene } = props;
  return (
    <div className={`${heightClass} w-full overflow-hidden rounded-xl border border-hairline bg-[#05070b]`}>
      <Canvas
        camera={{ position: [0, 62, 118], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "low-power", failIfMajorPerformanceCaveat: false }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault(), false);
        }}
      >
        <fog attach="fog" args={["#05070b", 190, 420]} />
        <Scene {...scene} />
      </Canvas>
    </div>
  );
}
