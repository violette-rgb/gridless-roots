import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { BuildSpec } from "@/lib/site-model";
import type { Site } from "@/lib/offgrid-data";

/**
 * Live three.js maquette of the campus: procedural relief keyed to the site's
 * coordinates, with halls, batteries, solar rows and turbines whose counts
 * follow the sliders. Rendered on a transparent canvas so it sits over the map.
 */

const GROUND = 60; // scene units across
const SEG = 96;

function hash(x: number, y: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Relief character derived from the site: coastal fjord, plateau or plain. */
function reliefProfile(site: Site) {
  const seed = Math.abs(Math.round(site.latitude * 91 + site.longitude * 37));
  const north = Math.max(0, Math.min(1, (site.latitude - 40) / 30));
  return {
    seed,
    amplitude: 1.4 + north * 4.6,
    frequency: 0.06 + (seed % 7) * 0.008,
    ridge: (seed % 3) / 2,
  };
}

function elevationFn(site: Site) {
  const { seed, amplitude, frequency, ridge } = reliefProfile(site);
  return (x: number, y: number) => {
    const n1 = noise(x * frequency, y * frequency, seed);
    const n2 = noise(x * frequency * 2.7, y * frequency * 2.7, seed + 3) * 0.45;
    const n3 = noise(x * frequency * 6.1, y * frequency * 6.1, seed + 11) * 0.18;
    let h = (n1 + n2 + n3) / 1.63;
    // a valley / water channel through the middle for coastal sites
    const channel = Math.exp(-((y + ridge * 10) ** 2) / 90) * 0.55;
    h -= channel;
    return h * amplitude;
  };
}

function Terrain({ site }: { site: Site }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(GROUND, GROUND, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const elev = elevationFn(site);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const low = new THREE.Color("#0d1a24");
    const mid = new THREE.Color("#1b3140");
    const high = new THREE.Color("#33566b");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = elev(x, z);
      pos.setY(i, h);
      const t = Math.max(0, Math.min(1, (h + 2) / 7));
      c.copy(low).lerp(mid, Math.min(1, t * 2));
      if (t > 0.5) c.lerp(high, (t - 0.5) * 2);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [site]);

  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0.02} flatShading />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#5fd8ff" wireframe transparent opacity={0.06} />
      </mesh>
    </>
  );
}

function Turbine({ position }: { position: [number, number, number] }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.z += dt * 1.1;
  });
  return (
    <group position={position}>
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.055, 0.11, 4.2, 8]} />
        <meshStandardMaterial color="#e8edf5" roughness={0.5} />
      </mesh>
      <mesh position={[0, 4.2, 0.12]}>
        <boxGeometry args={[0.2, 0.2, 0.44]} />
        <meshStandardMaterial color="#cbd5e3" />
      </mesh>
      <group ref={rotor} position={[0, 4.2, 0.36]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, 0]}>
            <boxGeometry args={[0.07, 2.5, 0.03]} />
            <meshStandardMaterial color="#f2f6fb" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Campus({ site, build }: { site: Site; build: BuildSpec }) {
  const elev = useMemo(() => elevationFn(site), [site]);

  const halls = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => {
        const x = (i - 1.5) * 3.1;
        const z = 0;
        return [x, elev(x, z), z] as [number, number, number];
      }),
    [elev],
  );

  const batteries = useMemo(() => {
    const n = Math.max(2, Math.min(60, Math.round(build.batt_mwh / 25)));
    return Array.from({ length: n }, (_, i) => {
      const col = i % 10;
      const row = Math.floor(i / 10);
      const x = -5 + col * 1.1;
      const z = 5.5 + row * 0.9;
      return [x, elev(x, z), z] as [number, number, number];
    });
  }, [build.batt_mwh, elev]);

  const solar = useMemo(() => {
    const rows = Math.max(1, Math.min(20, Math.round(build.pv_mw / 6)));
    return Array.from({ length: rows }, (_, i) => {
      const z = -5 - i * 1.15;
      const x = 1.5;
      return [x, elev(x, z), z] as [number, number, number];
    });
  }, [build.pv_mw, elev]);

  const turbines = useMemo(() => {
    const n = Math.max(0, Math.min(48, build.turbines));
    const out: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.11;
      const r = 15 + (i % 4) * 3.2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.9;
      out.push([x, elev(x, z), z]);
    }
    return out;
  }, [build.turbines, elev]);

  return (
    <group>
      {halls.map((p, i) => (
        <mesh key={`h${i}`} position={[p[0], p[1] + 0.45, p[2]]}>
          <boxGeometry args={[2.1, 0.9, 7.4]} />
          <meshStandardMaterial color="#c8cfe0" roughness={0.6} />
        </mesh>
      ))}
      {batteries.map((p, i) => (
        <mesh key={`b${i}`} position={[p[0], p[1] + 0.16, p[2]]}>
          <boxGeometry args={[0.8, 0.32, 0.42]} />
          <meshStandardMaterial color="#8fa3b8" roughness={0.7} />
        </mesh>
      ))}
      {solar.map((p, i) => (
        <mesh key={`s${i}`} position={[p[0], p[1] + 0.18, p[2]]} rotation={[-0.52, 0, 0]}>
          <planeGeometry args={[10.5, 0.75]} />
          <meshStandardMaterial
            color="#1b3a5c"
            side={THREE.DoubleSide}
            roughness={0.35}
            metalness={0.35}
          />
        </mesh>
      ))}
      {turbines.map((p, i) => (
        <Turbine key={`t${i}`} position={p} />
      ))}
    </group>
  );
}

function Rig({ expanded }: { expanded: boolean }) {
  const target = expanded ? { r: 46, y: 26 } : { r: 34, y: 19 };
  const state = useRef({ r: 34, y: 19, a: 0.6 });
  useFrame(({ camera }, dt) => {
    const s = state.current;
    const k = Math.min(dt * 2.6, 1);
    s.r += (target.r - s.r) * k;
    s.y += (target.y - s.y) * k;
    s.a += dt * 0.055;
    camera.position.set(Math.cos(s.a) * s.r, s.y, Math.sin(s.a) * s.r);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function SiteMaquette3D({
  site,
  build,
  expanded = false,
  className = "",
}: {
  site: Site;
  build: BuildSpec;
  expanded?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 32, near: 0.5, far: 400, position: [26, 19, 26] }}
        style={{ background: "transparent" }}
      >
        <hemisphereLight args={["#5fd8ff", "#05070a", 0.55]} />
        <directionalLight position={[18, 26, 10]} intensity={1.15} color="#dceaf6" />
        <directionalLight position={[-20, 10, -14]} intensity={0.35} color="#2b7fa8" />
        <Terrain site={site} />
        <Campus site={site} build={build} />
        <Rig expanded={expanded} />
      </Canvas>
    </div>
  );
}
