import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type GrilleAxes,
  siteVerdict,
  referenceLolp,
  formatLolp,
  VERDICT_COLOR,
  type Site,
} from "@/lib/offgrid-data";
import { terrainFor, heightAt, waterLevel, seedOf } from "@/lib/terrain";

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

type ViewState = { lon: number; lat: number; progress: number };
type ProjectedPoint = { x: number; y: number; visible: boolean; shade: number };
type TransformState = { x: number; y: number; scale: number };

const RAD = Math.PI / 180;
const HOME: [number, number] = [10, 50];
const SVG_SIZE = 1000;
const CX = 520;
const CY = 500;
const HOME_R = 286;
const HOME_VIEW: ViewState = { lon: HOME[0], lat: HOME[1], progress: 0 };
const SITE_SCALE = 3.1;

function projectPoint(lon: number, lat: number, view: ViewState): ProjectedPoint {
  const radius = HOME_R;
  const lambda = (lon - view.lon) * RAD;
  const phi = lat * RAD;
  const phi0 = view.lat * RAD;
  const cosPhi = Math.cos(phi);
  const x = CX + radius * cosPhi * Math.sin(lambda);
  const y = CY - radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * cosPhi * Math.cos(lambda));
  const shade = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * cosPhi * Math.cos(lambda);
  return { x, y, visible: shade > -0.04, shade };
}

function ringPath(ring: number[][], view: ViewState) {
  const parts: string[] = [];
  let open = false;
  let points = 0;
  for (const point of ring) {
    const lon = point[0];
    const lat = point[1];
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    const p = projectPoint(lon, lat, view);
    if (!p.visible) {
      open = false;
      continue;
    }
    parts.push(`${open ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    open = true;
    points += 1;
  }
  if (points > 2) parts.push("Z");
  return parts.join(" ");
}

function geometryPath(geometry: CountryGeometry, view: ViewState) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates as number[][][]] : (geometry.coordinates as number[][][][]);
  return polygons
    .map((polygon) => polygon.map((ring) => ringPath(ring, view)).join(" "))
    .filter(Boolean)
    .join(" ");
}

function sampledLinePath(points: [number, number][], view: ViewState) {
  let path = "";
  let open = false;
  for (const [lon, lat] of points) {
    const p = projectPoint(lon, lat, view);
    if (!p.visible) {
      open = false;
      continue;
    }
    path += `${open ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    open = true;
  }
  return path.trim();
}

function useCountries() {
  const [countries, setCountries] = useState<CountryCollection | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/world-countries.geo.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (alive && json?.type === "FeatureCollection") setCountries(json as CountryCollection);
      })
      .catch((error) => console.error("[globe] local country outlines failed", error));
    return () => {
      alive = false;
    };
  }, []);
  return countries;
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Cinematic camera tween. Runs entirely off React state: every frame is written
 * straight to the DOM, so the globe never re-renders mid-flight.
 */
function useCameraTween(target: TransformState, apply: (t: TransformState, reveal: number) => void) {
  const currentRef = useRef<TransformState>(target);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const from = currentRef.current;
    const duration =
      Math.abs(Math.log(target.scale / from.scale)) > 0.05 ? 1900 : 900;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = easeInOut(p);
      // zoom interpolates geometrically so the descent feels linear in altitude
      const scale = from.scale * Math.pow(target.scale / from.scale, e);
      const next = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        scale,
      };
      currentRef.current = next;
      const reveal = Math.max(0, Math.min(1, (scale - 1.5) / (SITE_SCALE - 2.0)));
      applyRef.current(next, reveal);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target.x, target.y, target.scale]);
}


function Graticule() {
  const paths = useMemo(() => {
    const result: [number, number][][] = [];
    for (let lon = -180; lon <= 180; lon += 15) result.push(Array.from({ length: 73 }, (_, i) => [lon, -90 + i * 2.5] as [number, number]));
    for (let lat = -75; lat <= 75; lat += 15) result.push(Array.from({ length: 145 }, (_, i) => [-180 + i * 2.5, lat] as [number, number]));
    return result.map((line) => sampledLinePath(line, HOME_VIEW)).filter(Boolean);
  }, []);
  return (
    <g opacity="0.13">
      {paths.map((d, index) => (
        <path key={index} d={d} fill="none" stroke="var(--primary)" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

function CountryLayer({ countries }: { countries: CountryCollection | null }) {
  const paths = useMemo(
    () =>
      (countries?.features ?? [])
        .map((feature, index) => ({
          id: `${feature.properties.name ?? "country"}-${index}`,
          d: geometryPath(feature.geometry, HOME_VIEW),
        }))
        .filter((item) => item.d),
    [countries],
  );

  return (
    <g>
      {paths.map(({ id, d }) => (
        <path
          key={id}
          d={d}
          fill="var(--muted)"
          fillOpacity="0.72"
          stroke="var(--foreground)"
          strokeOpacity="0.34"
          strokeWidth="0.8"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}


/** Pure topographic zoom of the selected zone — relief only, no schematic overlay. */
function SiteTerrainPlan({ site }: { site: Site }) {
  const center = projectPoint(site.longitude, site.latitude, HOME_VIEW);
  const terrain = terrainFor(site.id, site.latitude);
  const seed = seedOf(site.id);

  const { cells, contours } = useMemo(() => {
    const N = 44;
    const span = 300;
    const step = span / N;
    const wl = waterLevel(terrain);
    const h: number[] = [];
    for (let iy = 0; iy < N; iy += 1) {
      for (let ix = 0; ix < N; ix += 1) {
        const u = ((ix + 0.5) / N) * 2 - 1;
        const v = ((iy + 0.5) / N) * 2 - 1;
        h.push(heightAt(u, v, terrain, seed));
      }
    }
    const bands = 12;
    const cellList = h.map((value, i) => {
      const ix = i % N;
      const iy = Math.floor(i / N);
      const submerged = wl !== null && value < wl;
      return {
        x: -span / 2 + ix * step,
        y: -span / 2 + iy * step,
        fill: submerged
          ? `rgb(8,${Math.round(26 + value * 40)},${Math.round(46 + value * 50)})`
          : `rgb(${Math.round(16 + value * 52)},${Math.round(26 + value * 74)},${Math.round(36 + value * 92)})`,
      };
    });
    // contour edges: mark cells where the elevation band changes
    const edges: { x: number; y: number; w: number; hgt: number; major: boolean }[] = [];
    for (let iy = 0; iy < N; iy += 1) {
      for (let ix = 0; ix < N; ix += 1) {
        const i = iy * N + ix;
        const band = Math.floor(h[i] * bands);
        const right = ix < N - 1 ? Math.floor(h[i + 1] * bands) : band;
        const down = iy < N - 1 ? Math.floor(h[i + N] * bands) : band;
        if (band === right && band === down) continue;
        edges.push({
          x: -span / 2 + ix * step,
          y: -span / 2 + iy * step,
          w: step,
          hgt: step,
          major: band % 3 === 0,
        });
      }
    }
    return { cells: cellList, contours: edges };
  }, [terrain, seed]);

  return (
    <g
      transform={`translate(${center.x} ${center.y})`}
      pointerEvents="none"
      shapeRendering="crispEdges"
    >

      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={7} height={7} fill={c.fill} />
      ))}
      <g shapeRendering="auto">
        {contours.map((c, i) => (
          <rect
            key={`c${i}`}
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.hgt}
            fill="var(--primary)"
            opacity={c.major ? 0.3 : 0.13}
          />
        ))}
      </g>
      <rect x="-150" y="-150" width="300" height="300" fill="none" stroke="var(--primary)" strokeOpacity="0.35" strokeWidth="0.7" strokeDasharray="4 6" />
      <text x="-150" y="-156" fill="var(--foreground)" fillOpacity="0.6" fontSize="6.5" letterSpacing="1">
        {site.nom.toUpperCase()} · 6 KM SURVEY · {terrain.landform.replace("-", " ").toUpperCase()} · {terrain.relief} M RELIEF
      </text>
      <g transform="translate(-146 142)">
        <line x1="0" y1="0" x2="50" y2="0" stroke="var(--foreground)" strokeOpacity="0.7" strokeWidth="0.9" />
        <text x="0" y="-4" fill="var(--foreground)" fillOpacity="0.6" fontSize="6">1 km</text>
      </g>
    </g>
  );
}


function MarkerLayer({
  sites,
  hoveredId,
  selectedId,
  approachedId,
  onHover,
  onSelect,
  panelOpen,
}: Pick<Props, "sites" | "hoveredId" | "selectedId" | "approachedId" | "onHover" | "onSelect" | "panelOpen">) {
  const focusId = selectedId ?? hoveredId;
  return (
    <g>
      {sites.map((site) => {
        const p = projectPoint(site.longitude, site.latitude, HOME_VIEW);
        if (!p.visible) return null;
        const color = VERDICT_COLOR[siteVerdict(site)];
        const isHovered = hoveredId === site.id;
        const isSelected = selectedId === site.id;
        const isFocus = focusId === site.id;
        const dimmed = Boolean((focusId && !isFocus) || (panelOpen && !isSelected));
        const r = isHovered || isSelected ? 10 : 6;
        return (
          <g key={site.id} opacity={dimmed ? 0.18 : 1} pointerEvents={focusId && !isFocus ? "none" : "auto"}>
            <circle cx={p.x} cy={p.y} r={r * 3.1} fill={color} opacity={isHovered ? 0.16 : 0.07} />
            <circle cx={p.x} cy={p.y} r={r * 1.7} fill="none" stroke={color} strokeOpacity="0.42" strokeWidth="1.4" />
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={color}
              stroke="var(--page)"
              strokeWidth="2.5"
              className="cursor-pointer"
              onPointerEnter={() => {
                if (!focusId || isFocus) onHover(site.id);
              }}
              onClick={() => {
                onHover(site.id);
                onSelect(site);
              }}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r="24"
              fill="transparent"
              className="cursor-pointer"
              onPointerEnter={() => {
                if (!focusId || isFocus) onHover(site.id);
              }}
              onClick={() => {
                onHover(site.id);
                onSelect(site);
              }}
            />
            {isHovered && approachedId !== site.id && <circle cx={p.x} cy={p.y} r="34" fill="none" stroke={color} strokeOpacity="0.28" strokeWidth="1.2" />}
          </g>
        );
      })}
    </g>
  );
}

export function WorldMap(props: Props) {
  const { sites, selectedId, hoveredId, approachedId, onHover, onSelect, panelOpen, onApproach, onZoomStageChange } = props;
  const countries = useCountries();
  const focusId = selectedId ?? hoveredId;
  const focus = focusId ? sites.find((site) => site.id === focusId) ?? null : null;
  const focusPoint = focus ? projectPoint(focus.longitude, focus.latitude, HOME_VIEW) : null;
  const scale = focus ? SITE_SCALE : 1;
  const mapX = focusPoint ? CX - focusPoint.x * scale : 0;
  const mapY = focusPoint ? CY - focusPoint.y * scale : 0;

  const cameraRef = useRef<SVGGElement | null>(null);
  const planRef = useRef<SVGGElement | null>(null);
  const markersRef = useRef<SVGGElement | null>(null);

  const applyCamera = useCallback((t: TransformState, reveal: number) => {
    if (cameraRef.current) {
      cameraRef.current.setAttribute(
        "transform",
        `matrix(${t.scale} 0 0 ${t.scale} ${t.x} ${t.y})`,
      );
    }
    if (planRef.current) planRef.current.setAttribute("opacity", reveal.toFixed(3));
    if (markersRef.current) {
      markersRef.current.setAttribute("opacity", (1 - reveal * 0.96).toFixed(3));
      markersRef.current.style.pointerEvents = reveal > 0.6 ? "none" : "auto";
    }
  }, []);

  useCameraTween({ x: mapX, y: mapY, scale }, applyCamera);


  useEffect(() => {
    if (!focus) {
      onApproach?.(null);
      onZoomStageChange?.("globe", null);
      return;
    }

    onApproach?.(null);
    onZoomStageChange?.("country", focus.id);
    const timers = [
      window.setTimeout(() => onZoomStageChange?.("city", focus.id), 700),
      window.setTimeout(() => onZoomStageChange?.("site", focus.id), 1450),
      // the 3D maquette only mounts once the camera has fully settled
      window.setTimeout(() => onApproach?.(focus.id), 2050),
    ];

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [focus, onApproach, onZoomStageChange]);

  const resetToGlobe = useCallback(() => {
    onHover(null);
    onApproach?.(null);
    onZoomStageChange?.("globe", null);
  }, [onApproach, onHover, onZoomStageChange]);

  return (
    <div className="absolute inset-0 bg-page">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} role="img" aria-label="Interactive off-grid site globe">
        <defs>
          <radialGradient id="globeOcean" cx="38%" cy="32%" r="68%">
            <stop offset="0%" stopColor="var(--muted)" stopOpacity="0.98" />
            <stop offset="48%" stopColor="var(--background)" stopOpacity="0.96" />
            <stop offset="100%" stopColor="var(--page)" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="globeShade" cx="32%" cy="28%" r="76%">
            <stop offset="0%" stopColor="white" stopOpacity="0.14" />
            <stop offset="54%" stopColor="var(--primary)" stopOpacity="0.03" />
            <stop offset="100%" stopColor="black" stopOpacity="0.46" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="1000" height="1000" fill="var(--page)" />
        <g ref={cameraRef} transform="matrix(1 0 0 1 0 0)">
          <circle cx={CX} cy={CY} r={HOME_R} fill="url(#globeOcean)" filter="url(#glow)" opacity="0.95" />
          <Graticule />
          <CountryLayer countries={countries} />
          <g ref={planRef} opacity="0" pointerEvents="none">
            {focus && <SiteTerrainPlan key={focus.id} site={focus} />}
          </g>
          <circle cx={CX} cy={CY} r={HOME_R} fill="url(#globeShade)" pointerEvents="none" />
          <circle cx={CX} cy={CY} r={HOME_R} fill="none" stroke="var(--primary)" strokeOpacity="0.2" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />

          <g ref={markersRef} opacity="1">
            <MarkerLayer
              sites={sites}
              hoveredId={hoveredId}
              selectedId={selectedId}
              approachedId={approachedId}
              onHover={onHover}
              onSelect={onSelect}
              panelOpen={panelOpen}
            />
          </g>

        </g>
      </svg>

      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="absolute right-6 top-24 z-40 flex items-center gap-2 md:right-10">
        <Button type="button" variant="outline" size="icon" onClick={resetToGlobe} aria-label="Return to globe" title="Return to globe" className="rounded-full border-primary/35 bg-background/55 text-primary backdrop-blur-xl hover:bg-primary/10">
          <RotateCcw aria-hidden="true" />
        </Button>
      </div>

      {/* Hover readout — fixed HUD, never follows the cursor */}
      <AnimatePresence>
        {focus && (
          <motion.div
            key={focus.id}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="panel pointer-events-none absolute right-6 top-40 z-40 w-[236px] px-4 py-3 md:right-10"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[13px] font-light">{focus.nom}</div>
              <div className="label-xs">{focus.pays}</div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className="num text-[28px] leading-none"
                style={{ color: VERDICT_COLOR[siteVerdict(focus)] }}
              >
                {formatLolp(referenceLolp(props.axes, focus))}%
              </span>
              <span className="label-xs">LOLP · ref. build</span>
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-hairline pt-3">
              <Readout label="Wind 100 m" value={`${focus.indicateurs.vent_100m_ms.toFixed(1)} m/s`} />
              <Readout label="Irradiance" value={`${Math.round(focus.indicateurs.irradiance_wm2)} W/m²`} />
              <Readout label="Air temp" value={`${focus.indicateurs.temperature_c.toFixed(1)} °C`} />
              <Readout label="Mean PUE" value={focus.indicateurs.pue_moyen.toFixed(3)} />
              <Readout label="Landform" value={terrainFor(focus.id, focus.latitude).landform.replace("-", " ")} />
            </dl>
          </motion.div>
        )}
      </AnimatePresence>


      <AnimatePresence>
        {!hoveredId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-28 left-1/2 z-20 w-[min(520px,calc(100vw-380px))] -translate-x-1/2 text-center text-[12px] font-light leading-relaxed text-foreground/62"
          >
            Local globe · no external map tiles. Hover a candidate to descend from continent to site plan.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="label-xs">{label}</dt>
      <dd className="num text-[12px] text-foreground/85">{value}</dd>
    </div>
  );
}
