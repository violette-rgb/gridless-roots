import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import {
  referenceLolp,
  type GrilleAxes,
  siteVerdict,
  formatLolp,
  VERDICT_COLOR,
  type Site,
} from "@/lib/offgrid-data";

export type ZoomStage = "globe" | "country" | "city" | "site";

interface Props {
  sites: Site[];
  axes: GrilleAxes;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (site: Site) => void;
  panelOpen: boolean;
  onApproach?: (id: string | null) => void;
  approachedId?: string | null;
  onZoomStageChange?: (stage: ZoomStage, siteId: string | null) => void;
}

type CountryGeometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

type CountryFeature = {
  type: "Feature";
  properties: { name?: string };
  geometry: CountryGeometry;
};

type CountryCollection = {
  type: "FeatureCollection";
  features: CountryFeature[];
};

const RAD = Math.PI / 180;
const GLOBE_RADIUS = 2.08;
const HOME_LOOK: [number, number] = [11, 49];

function llToVector(lon: number, lat: number, radius = GLOBE_RADIUS) {
  const phi = (90 - lat) * RAD;
  const theta = (lon + 180) * RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function stageFromProgress(progress: number, targetId: string | null): ZoomStage {
  if (!targetId || progress < 0.13) return "globe";
  if (progress < 0.46) return "country";
  if (progress < 0.78) return "city";
  return "site";
}

function drawRing(ctx: CanvasRenderingContext2D, ring: number[][], width: number, height: number) {
  let started = false;
  let previousX = 0;
  for (const point of ring) {
    const lon = point[0];
    const lat = point[1];
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    const x = ((lon + 180) / 360) * width;
    const y = ((90 - lat) / 180) * height;
    if (!started || Math.abs(x - previousX) > width * 0.45) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
    previousX = x;
  }
}

function drawPolygonSet(
  ctx: CanvasRenderingContext2D,
  geometry: CountryGeometry,
  width: number,
  height: number,
) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : (geometry.coordinates as number[][][][]);
  for (const polygon of polygons) {
    ctx.beginPath();
    for (const ring of polygon) drawRing(ctx, ring, width, height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function makeWorldTexture(collection: CountryCollection | null) {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0d2230");
  bg.addColorStop(0.5, "#061722");
  bg.addColorStop(1, "#08131e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(127, 214, 242, 0.16)";
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (collection) {
    ctx.fillStyle = "rgba(111, 142, 160, 0.88)";
    ctx.strokeStyle = "rgba(226, 246, 255, 0.54)";
    ctx.lineWidth = 1.4;
    for (const feature of collection.features) drawPolygonSet(ctx, feature.geometry, width, height);
  } else {
    ctx.fillStyle = "rgba(111, 142, 160, 0.42)";
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.38, width * 0.19, height * 0.16, -0.2, 0, Math.PI * 2);
    ctx.ellipse(width * 0.41, height * 0.48, width * 0.14, height * 0.18, 0.4, 0, Math.PI * 2);
    ctx.ellipse(width * 0.58, height * 0.52, width * 0.16, height * 0.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function useCountryTexture() {
  const [countries, setCountries] = useState<CountryCollection | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/world-countries.geo.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (alive && json?.type === "FeatureCollection") setCountries(json as CountryCollection);
      })
      .catch((error) => console.error("[stable-globe] country outlines unavailable", error));
    return () => {
      alive = false;
    };
  }, []);

  const texture = useMemo(() => makeWorldTexture(countries), [countries]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function CameraRig({
  sites,
  hoveredId,
  selectedId,
  onApproach,
  onZoomStageChange,
}: {
  sites: Site[];
  hoveredId: string | null;
  selectedId: string | null;
  onApproach?: (id: string | null) => void;
  onZoomStageChange?: (stage: ZoomStage, siteId: string | null) => void;
}) {
  const { camera } = useThree();
  const progress = useRef(0);
  const lastStage = useRef<ZoomStage>("globe");
  const lastApproach = useRef<string | null>(null);
  const focusId = selectedId ?? hoveredId;
  const focus = focusId ? sites.find((site) => site.id === focusId) ?? null : null;

  useFrame((_, delta) => {
    const targetProgress = focus ? 1 : 0;
    const speed = focus ? 1.15 : 1.75;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, speed, delta);
    const eased = progress.current * progress.current * (3 - 2 * progress.current);

    const homeDir = llToVector(HOME_LOOK[0], HOME_LOOK[1], 1).normalize();
    const homePos = homeDir.clone().multiplyScalar(7.1);
    const homeLook = new THREE.Vector3(0, 0, 0);

    const siteDir = focus ? llToVector(focus.longitude, focus.latitude, 1).normalize() : homeDir;
    const side = new THREE.Vector3(0, 1, 0).cross(siteDir).normalize().multiplyScalar(0.2);
    const endPos = siteDir.clone().multiplyScalar(2.95).add(side);
    const endLook = siteDir.clone().multiplyScalar(GLOBE_RADIUS * 1.01);

    camera.position.copy(homePos.lerp(endPos, eased));
    camera.lookAt(homeLook.lerp(endLook, eased));
    camera.updateProjectionMatrix();

    const stage = stageFromProgress(progress.current, focus?.id ?? null);
    if (stage !== lastStage.current) {
      lastStage.current = stage;
      onZoomStageChange?.(stage, focus?.id ?? null);
    }

    const approachId = stage === "site" ? focus?.id ?? null : null;
    if (approachId !== lastApproach.current) {
      lastApproach.current = approachId;
      onApproach?.(approachId);
    }
  });

  return null;
}

function GlobeMesh() {
  const texture = useCountryTexture();
  return (
    <group>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 128, 96]} />
        <meshStandardMaterial map={texture ?? undefined} roughness={0.78} metalness={0.03} />
      </mesh>
      <mesh scale={1.012}>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 64]} />
        <meshBasicMaterial color="#7fd6f2" transparent opacity={0.045} wireframe />
      </mesh>
      <mesh scale={1.035}>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 64]} />
        <meshBasicMaterial color="#5ee7de" transparent opacity={0.045} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function SiteMarkers({
  sites,
  axes,
  hoveredId,
  selectedId,
  approachedId,
  onHover,
  onSelect,
  panelOpen,
}: Pick<Props, "sites" | "axes" | "hoveredId" | "selectedId" | "approachedId" | "onHover" | "onSelect" | "panelOpen">) {
  return (
    <group>
      {sites.map((site) => {
        const position = llToVector(site.longitude, site.latitude, GLOBE_RADIUS * 1.026);
        const lolp = referenceLolp(axes, site);
        const color = VERDICT_COLOR[siteVerdict(site)];
        const isHovered = hoveredId === site.id;
        const isSelected = selectedId === site.id;
        const dimmed = Boolean((hoveredId && !isHovered) || (panelOpen && !isSelected));
        const markerScale = isHovered || isSelected ? 1.42 : 1;
        return (
          <group key={site.id} position={position}>
            <mesh
              scale={markerScale}
              onPointerEnter={(event) => {
                event.stopPropagation();
                onHover(site.id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                onHover(site.id);
                onSelect(site);
              }}
            >
              <sphereGeometry args={[0.045, 24, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isHovered || isSelected ? 1.7 : 0.95}
                transparent
                opacity={dimmed ? 0.38 : 1}
              />
            </mesh>
            <mesh
              scale={markerScale}
              onPointerEnter={(event) => {
                event.stopPropagation();
                onHover(site.id);
              }}
              onClick={(event) => {
                event.stopPropagation();
                onHover(site.id);
                onSelect(site);
              }}
            >
              <sphereGeometry args={[0.16, 24, 16]} />
              <meshBasicMaterial color={color} transparent opacity={isHovered ? 0.18 : 0.06} />
            </mesh>
            {isHovered && approachedId !== site.id && (
              <Html center distanceFactor={8} position={[0.18, 0.14, 0]} className="pointer-events-none">
                <div className="panel whitespace-nowrap px-4 py-2.5 shadow-2xl">
                  <div className="label-xs">{site.nom} · {site.pays}</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="num text-3xl font-extralight leading-none" style={{ color }}>
                      {formatLolp(lolp)}
                    </span>
                    <span className="text-xs opacity-65">% LOLP</span>
                  </div>
                  <div className="label-xs mt-1">reference build · 50 MW</div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

function StableGlobeScene(props: Props) {
  return (
    <Canvas camera={{ position: [0, 0, 7.1], fov: 38, near: 0.1, far: 40 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={["#111b24"]} />
      <ambientLight intensity={0.62} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} color="#e6f7ff" />
      <pointLight position={[-4, -1, 3]} intensity={1.1} color="#5ee7de" />
      <GlobeMesh />
      <SiteMarkers {...props} />
      <CameraRig
        sites={props.sites}
        hoveredId={props.hoveredId}
        selectedId={props.selectedId}
        onApproach={props.onApproach}
        onZoomStageChange={props.onZoomStageChange}
      />
    </Canvas>
  );
}

export function WorldMap(props: Props) {
  const { onHover, onApproach, onZoomStageChange } = props;
  const [resetKey, setResetKey] = useState(0);

  const resetToGlobe = useCallback(() => {
    onHover(null);
    onApproach?.(null);
    onZoomStageChange?.("globe", null);
    setResetKey((key) => key + 1);
  }, [onApproach, onHover, onZoomStageChange]);

  return (
    <div className="absolute inset-0 bg-page">
      <div className="absolute inset-0 h-full w-full">
        <StableGlobeScene key={resetKey} {...props} />
      </div>
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_52%_44%,transparent_0%,transparent_34%,var(--page)_78%)] opacity-20" />

      <div className="absolute right-6 top-24 z-40 flex items-center gap-2 md:right-10">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={resetToGlobe}
          aria-label="Return to globe"
          title="Return to globe"
          className="rounded-full border-primary/35 bg-background/55 text-primary backdrop-blur-xl hover:bg-primary/10"
        >
          <RotateCcw aria-hidden="true" />
        </Button>
      </div>

      <AnimatePresence>
        {!props.hoveredId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-28 left-1/2 z-20 w-[min(520px,calc(100vw-380px))] -translate-x-1/2 text-center text-[12px] font-light leading-relaxed text-foreground/62"
          >
            Local 3D globe · no external map tiles. Hover any candidate to descend smoothly from continent to site scale.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}