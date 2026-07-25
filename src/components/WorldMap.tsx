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
import { terrainFor } from "@/lib/terrain";

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
const SITE_SCALE = 4.25;

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

function useSmoothTransform(target: TransformState) {
  const currentRef = useRef<TransformState>(target);
  const [current, setCurrent] = useState<TransformState>(target);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const previous = currentRef.current;
      const k = 1 - Math.exp(-1.85 * dt);
      const next = {
        x: previous.x + (target.x - previous.x) * k,
        y: previous.y + (target.y - previous.y) * k,
        scale: previous.scale + (target.scale - previous.scale) * k,
      };
      const settled =
        Math.abs(next.x - target.x) < 0.2 &&
        Math.abs(next.y - target.y) < 0.2 &&
        Math.abs(next.scale - target.scale) < 0.002;
      currentRef.current = settled ? target : next;
      setCurrent(currentRef.current);
      if (!settled) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target.x, target.y, target.scale]);

  return current;
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

function seedNum(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h;
}

/** Zoomed-in topographic site map, drawn in globe coordinates around the site. */
function SiteTerrainPlan({ site, reveal }: { site: Site; reveal: number }) {
  const center = projectPoint(site.longitude, site.latitude, HOME_VIEW);
  const terrain = terrainFor(site.id, site.latitude);
  const seed = seedNum(site.id);
  const rug = terrain.ruggedness;

  const contours = useMemo(() => {
    const rows: { d: string; index: number }[] = [];
    for (let i = 0; i < 16; i += 1) {
      const y = -132 + i * 17;
      const a = Math.sin(seed * 0.017 + i * 0.7) * 16 * (0.5 + rug);
      const b = Math.cos(seed * 0.031 + i * 0.53) * 13 * (0.5 + rug);
      const c = Math.sin(seed * 0.011 + i * 0.9) * 10 * (0.4 + rug);
      rows.push({
        index: i,
        d: `M-150 ${(y + a * 0.4).toFixed(1)} C-96 ${(y - a).toFixed(1)} -44 ${(y + b).toFixed(1)} 6 ${(y - c).toFixed(1)} C58 ${(y + b * 0.6).toFixed(1)} 106 ${(y - a * 0.7).toFixed(1)} 150 ${(y + c * 0.5).toFixed(1)}`,
      });
    }
    return rows;
  }, [seed, rug]);

  const turbines = useMemo(
    () =>
      Array.from({ length: rug > 0.7 ? 7 : 9 }, (_, i) => {
        const t = i / (rug > 0.7 ? 6 : 8);
        return {
          x: -132 + t * 264,
          y: -104 + Math.sin(seed * 0.013 + t * 3.1) * 20 * (0.4 + rug),
        };
      }),
    [seed, rug],
  );

  const panelRows = rug > 0.62 ? 3 : 5;

  return (
    <motion.g
      transform={`translate(${center.x} ${center.y})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: reveal }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "linear" }}
      pointerEvents="none"
    >
      {/* survey ground */}
      <rect x="-152" y="-136" width="304" height="272" rx="3" fill="var(--muted)" opacity="0.5" />
      {terrain.coastal && (
        <path d="M-152 96 C-96 84 -42 112 10 100 C64 88 110 116 152 104 L152 136 L-152 136 Z" fill="var(--page)" opacity="0.9" />
      )}
      {contours.map(({ d, index }) => (
        <path
          key={index}
          d={d}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity={index % 4 === 0 ? 0.5 : 0.22}
          strokeWidth={index % 4 === 0 ? 0.9 : 0.5}
        />
      ))}

      {/* access road */}
      <path
        d={`M-152 ${(40 + (seed % 17)).toFixed(0)} C-80 ${(20 + (seed % 11)).toFixed(0)} -30 60 8 44 C48 27 96 40 152 18`}
        fill="none"
        stroke="var(--foreground)"
        strokeOpacity="0.4"
        strokeWidth="1.6"
        strokeDasharray="6 4"
      />

      {/* turbine array on the exposed ridge */}
      {turbines.map((t, i) => (
        <g key={i} transform={`translate(${t.x.toFixed(1)} ${t.y.toFixed(1)})`}>
          <circle r="13" fill="none" stroke="var(--primary)" strokeOpacity="0.28" strokeWidth="0.5" />
          <line y1="0" y2="-9" stroke="var(--foreground)" strokeOpacity="0.85" strokeWidth="0.9" />
          <line x1="0" y1="-9" x2="0" y2="-16" stroke="var(--foreground)" strokeOpacity="0.85" strokeWidth="0.7" />
          <line x1="0" y1="-9" x2="6.5" y2="-5" stroke="var(--foreground)" strokeOpacity="0.85" strokeWidth="0.7" />
          <line x1="0" y1="-9" x2="-6.5" y2="-5" stroke="var(--foreground)" strokeOpacity="0.85" strokeWidth="0.7" />
        </g>
      ))}

      {/* PV field on the gentle south-facing slope */}
      <g transform="translate(-134 46)">
        {Array.from({ length: panelRows * 10 }, (_, i) => (
          <rect
            key={i}
            x={(i % 10) * 9.4}
            y={Math.floor(i / 10) * 7.4}
            width="7"
            height="4.2"
            fill="var(--primary)"
            opacity="0.6"
          />
        ))}
      </g>

      {/* data halls on the graded pad */}
      <g transform="translate(56 62)">
        <rect x="-42" y="-20" width="84" height="42" rx="1.5" fill="var(--foreground)" opacity="0.16" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={-36 + i * 25} y="-14" width="21" height="30" fill="var(--foreground)" opacity="0.78" />
        ))}
        <rect x="-36" y="20" width="72" height="3" fill="var(--primary)" opacity="0.5" />
      </g>

      {/* survey frame, scale bar, north arrow */}
      <rect x="-152" y="-136" width="304" height="272" fill="none" stroke="var(--primary)" strokeOpacity="0.4" strokeWidth="0.8" strokeDasharray="4 5" />
      <g transform="translate(-144 126)">
        <line x1="0" y1="0" x2="48" y2="0" stroke="var(--foreground)" strokeOpacity="0.7" strokeWidth="1" />
        <line x1="0" y1="-3" x2="0" y2="3" stroke="var(--foreground)" strokeOpacity="0.7" strokeWidth="1" />
        <line x1="48" y1="-3" x2="48" y2="3" stroke="var(--foreground)" strokeOpacity="0.7" strokeWidth="1" />
        <text x="0" y="-5" fill="var(--foreground)" fillOpacity="0.65" fontSize="6" letterSpacing="0.6">1 km</text>
      </g>
      <g transform="translate(138 -122)">
        <path d="M0 -10 L4 6 L0 2 L-4 6 Z" fill="var(--primary)" opacity="0.8" />
        <text x="-2.6" y="16" fill="var(--foreground)" fillOpacity="0.6" fontSize="6.5">N</text>
      </g>
      <text x="-150" y="-142" fill="var(--foreground)" fillOpacity="0.55" fontSize="6.5" letterSpacing="1">
        {site.nom.toUpperCase()} · 6 KM SURVEY · {terrain.landform.replace("-", " ").toUpperCase()} · {terrain.relief} M RELIEF
      </text>
    </motion.g>
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
  const mapTransform = useSmoothTransform({ x: mapX, y: mapY, scale });

  useEffect(() => {
    if (!focus) {
      onApproach?.(null);
      onZoomStageChange?.("globe", null);
      return;
    }

    onApproach?.(null);
    onZoomStageChange?.("country", focus.id);
    const timers = [
      window.setTimeout(() => onZoomStageChange?.("city", focus.id), 950),
      window.setTimeout(() => onZoomStageChange?.("site", focus.id), 1950),
      window.setTimeout(() => onApproach?.(focus.id), 2850),
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
        <g transform={`matrix(${mapTransform.scale} 0 0 ${mapTransform.scale} ${mapTransform.x} ${mapTransform.y})`}>
          <circle cx={CX} cy={CY} r={HOME_R} fill="url(#globeOcean)" filter="url(#glow)" opacity="0.95" />
          <Graticule />
          <CountryLayer countries={countries} />
          <AnimatePresence>{focus && reveal > 0.01 && <SiteTerrainPlan key={focus.id} site={focus} reveal={reveal} />}</AnimatePresence>
          <circle cx={CX} cy={CY} r={HOME_R} fill="url(#globeShade)" pointerEvents="none" />
          <circle cx={CX} cy={CY} r={HOME_R} fill="none" stroke="var(--primary)" strokeOpacity="0.2" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />

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
      </svg>

      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="absolute right-6 top-24 z-40 flex items-center gap-2 md:right-10">
        <Button type="button" variant="outline" size="icon" onClick={resetToGlobe} aria-label="Return to globe" title="Return to globe" className="rounded-full border-primary/35 bg-background/55 text-primary backdrop-blur-xl hover:bg-primary/10">
          <RotateCcw aria-hidden="true" />
        </Button>
      </div>

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