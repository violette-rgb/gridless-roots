import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Group } from "three";

function Turbine({ position, phase }: { position: [number, number, number]; phase: number }) {
  const rotor = useRef<Group>(null);
  useFrame((_, d) => {
    if (rotor.current) rotor.current.rotation.z += d * 0.6;
  });
  return (
    <group position={position}>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.06, 0.1, 6, 8]} />
        <meshStandardMaterial color="#cfd6ee" emissive="#7fb6d8" emissiveIntensity={0.25} />
      </mesh>
      <group ref={rotor} position={[0, 6, 0.15]} rotation={[0, 0, phase]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, 0]}>
            <boxGeometry args={[0.08, 2.4, 0.03]} />
            <meshStandardMaterial
              color="#e6ecff"
              emissive="#8fd8f2"
              emissiveIntensity={0.35}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Hall({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color="#dcd8f2"
        emissive="#8f9ce0"
        emissiveIntensity={0.35}
        roughness={0.6}
      />
    </mesh>
  );
}

function Scene({
  turbines,
  pv,
  batt,
  pIt,
}: {
  turbines: number;
  pv: number;
  batt: number;
  pIt: number;
}) {
  const rig = useRef<Group>(null);
  useFrame((_, d) => {
    if (rig.current) rig.current.rotation.y += d * 0.045;
  });

  const turbinePos = useMemo(() => {
    const n = Math.round(turbines);
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const r = 26 + (i % 2) * 3;
      return [Math.cos(a) * r, 0, Math.sin(a) * r] as [number, number, number];
    });
  }, [turbines]);

  const pvRows = Math.round(pv / 25);
  const battUnits = Math.max(1, Math.round(batt / 100));
  const battCols = 6;
  const halls = Math.max(2, Math.round(pIt / 10));

  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#8fd8f2", "#0a0e18", 0.6]} />
      <pointLight position={[0, 18, 0]} intensity={60} color="#8fd8f2" distance={80} />

      <group ref={rig}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <circleGeometry args={[34, 64]} />
          <meshStandardMaterial color="#0a0f18" roughness={1} />
        </mesh>
        <gridHelper args={[68, 68, "#1d3a4a", "#12212e"]} position={[0, 0, 0]} />

        {/* Data centre halls */}
        {Array.from({ length: halls }).map((_, i) => (
          <Hall
            key={i}
            position={[-14 + (i % 3) * 5, 0.9, -6 + Math.floor(i / 3) * 6]}
            size={[4, 1.8, 10]}
          />
        ))}

        {/* Solar rows */}
        {Array.from({ length: pvRows }).map((_, r) =>
          Array.from({ length: 8 }).map((__, c) => (
            <mesh
              key={`${r}-${c}`}
              position={[6 + c * 1.7, 0.45, -10 + r * 1.5]}
              rotation={[-Math.PI / 3.2, 0, 0]}
            >
              <planeGeometry args={[1.4, 1.1]} />
              <meshStandardMaterial
                color="#16324a"
                emissive="#3ea6d8"
                emissiveIntensity={0.28}
                side={2}
              />
            </mesh>
          )),
        )}

        {/* Battery containers */}
        {Array.from({ length: battUnits }).map((_, i) => (
          <mesh
            key={i}
            position={[
              5 + (i % battCols) * 1.4,
              0.4,
              10 + Math.floor(i / battCols) * 1.1,
            ]}
          >
            <boxGeometry args={[1.1, 0.8, 0.7]} />
            <meshStandardMaterial
              color="#c9d4ea"
              emissive="#6fb0d0"
              emissiveIntensity={0.25}
            />
          </mesh>
        ))}

        {turbinePos.map((p, i) => (
          <Turbine key={i} position={p} phase={(i * 1.7) % Math.PI} />
        ))}
      </group>

      <OrbitControls
        enablePan={false}
        minDistance={25}
        maxDistance={90}
        maxPolarAngle={Math.PI / 2.15}
      />
    </>
  );
}

export default function SiteConcept(props: {
  turbines: number;
  pv: number;
  batt: number;
  pIt: number;
}) {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-hairline bg-[#05070b]">
      <Canvas camera={{ position: [0, 22, 48], fov: 42 }} dpr={[1, 1.8]}>
        <fog attach="fog" args={["#05070b", 60, 130]} />
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
