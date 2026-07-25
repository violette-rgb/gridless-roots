import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
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

type ViewState = { lon: number; lat: number; progress: number };
type ProjectedPoint = { x: number; y: number; visible: boolean; shade: number };

const RAD = Math.PI / 180;
const HOME: [number, number] = [10, 50];
const SVG_SIZE = 1000;
const CX = 520;
const CY = 500;
const HOME_R = 286;

function shortestLon(current: number, target: number) {
  const delta = ((target - current + 540) % 360) - 180;
  return current + (Number.isNaN(delta) ? 0 : delta);
}

function stageFromProgress(progress: number, siteId: string | null): ZoomStage {
  if (!siteId || progress < 0.12) return "globe";
  if (progress < 0.46) return "country";
  if (progress < 0.78) return "city";
  return "site";
}

function radiusFor(progress: number) {
  const eased = progress * progress * (3 - 2 * progress);
  return HOME_R + eased * 1120;
}

function projectPoint(lon: number, lat: number, view: ViewState): ProjectedPoint {
  const radius = radiusFor(view.progress);
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
  if (points > 2 && view.progress < 0.72) parts.push("Z");
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

function useAnimatedView(sites: Site[], hoveredId: string | null, selectedId: string | null) {
  const focusId = selectedId ?? hoveredId;
  const focus = focusId ? sites.find((site) => site.id === focusId) ?? null : null;
  const target = focus ? { lon: focus.longitude, lat: focus.latitude, progress: 1 } : { lon: HOME[0], lat: HOME[1], progress: 0 };
  const viewRef = useRef<ViewState>({ lon: HOME[0], lat: HOME[1], progress: 0 });
  const [view, setView] = useState<ViewState>(viewRef.current);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const current = viewRef.current;
      const lonTarget = shortestLon(current.lon, target.lon);
      const k = 1 - Math.exp(-(target.progress > current.progress ? 1.55 : 2.35) * dt);
      const next = {
        lon: current.lon + (lonTarget - current.lon) * k,
        lat: current.lat + (target.lat - current.lat) * k,
        progress: current.progress + (target.progress - current.progress) * k,
      };
      viewRef.current = next;
      setView(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target.lat, target.lon, target.progress]);

  return { view, focus };
}

function Graticule({ view }: { view: ViewState }) {
  const lines = useMemo(() => {
    const result: [number, number][][] = [];
    for (let lon = -180; lon <= 180; lon += 15) result.push(Array.from({ length: 73 }, (_, i) => [lon, -90 + i * 2.5] as [number, number]));
    for (let lat = -75; lat <= 75; lat += 15) result.push(Array.from({ length: 145 }, (_, i) => [-180 + i * 2.5, lat] as [number, number]));
    return result;
  }, []);
  return (
    <g opacity={Math.max(0.04, 0.16 - view.progress * 0.09)}>
      {lines.map((line, index) => {
        const d = sampledLinePath(line, view);
        return d ? <path key={index} d={d} fill="none" stroke="var(--primary)" strokeWidth={0.9} /> : null;
      })}
    </g>
  );
}

function CountryLayer({ countries, view }: { countries: CountryCollection | null; view: ViewState }) {
  return (
    <g>
      {(countries?.features ?? []).map((feature, index) => {
        const d = geometryPath(feature.geometry, view);
        if (!d) return null;
        return (
          <path
            key={`${feature.properties.name ?? "country"}-${index}`}
            d={d}
            fill="var(--muted)"
            fillOpacity={view.progress > 0.7 ? 0.22 : 0.74}
            stroke="var(--foreground)"
            strokeOpacity={view.progress > 0.72 ? 0.42 : 0.3}
            strokeWidth={view.progress > 0.75 ? 1.05 : 0.7}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

function SurveyPlan({ view, site }: { view: ViewState; site: Site | null }) {
  if (!site || view.progress < 0.73) return null;
  const center = projectPoint(site.longitude, site.latitude, view);
  const opacity = Math.min(1, (view.progress - 0.73) / 0.18);
  const scale = 0.72 + view.progress * 0.42;
  return (
    <g transform={`translate(${center.x} ${center.y}) scale(${scale}) rotate(-18)`} opacity={opacity}>
      <rect x="-58" y="-36" width="116" height="72" rx="4" fill="var(--foreground)" opacity="0.82" />
      <rect x="-49" y="-25" width="98" height="18" rx="2" fill="var(--page)" opacity="0.78" />
      <rect x="-49" y="4" width="98" height="18" rx="2" fill="var(--page)" opacity="0.78" />
      {Array.from({ length: 18 }, (_, i) => {
        const col = i % 6;
        const row = Math.floor(i / 6);
        return <rect key={i} x={-126 + col * 20} y={58 + row * 12} width="15" height="7" fill="var(--primary)" opacity="0.7" />;
      })}
      <path d="M-148 -76 C-92 -118 -42 -98 0 -126 C46 -156 94 -122 142 -148" fill="none" stroke="var(--primary)" strokeWidth="2" strokeDasharray="7 6" opacity="0.72" />
      {[-138, -78, -14, 52, 118].map((x, index) => (
        <g key={x} transform={`translate(${x} ${index % 2 ? -96 : -122})`}>
          <line y1="0" y2="-28" stroke="var(--foreground)" strokeWidth="2" />
          <circle cy="-34" r="8" fill="none" stroke="var(--foreground)" strokeWidth="2" />
          <line x1="0" y1="-34" x2="0" y2="-47" stroke="var(--foreground)" strokeWidth="1.6" />
          <line x1="0" y1="-34" x2="11" y2="-28" stroke="var(--foreground)" strokeWidth="1.6" />
          <line x1="0" y1="-34" x2="-11" y2="-28" stroke="var(--foreground)" strokeWidth="1.6" />
        </g>
      ))}
      <rect x="-165" y="-165" width="330" height="330" fill="none" stroke="var(--primary)" strokeWidth="1.4" strokeDasharray="5 8" opacity="0.32" />
    </g>
  );
}

function MarkerLayer({
  sites,
  axes,
  view,
  hoveredId,
  selectedId,
  approachedId,
  onHover,
  onSelect,
  panelOpen,
}: Pick<Props, "sites" | "axes" | "hoveredId" | "selectedId" | "approachedId" | "onHover" | "onSelect" | "panelOpen"> & { view: ViewState }) {
  return (
    <g>
      {sites.map((site) => {
        const p = projectPoint(site.longitude, site.latitude, view);
        if (!p.visible) return null;
        const lolp = referenceLolp(axes, site);
        const color = VERDICT_COLOR[siteVerdict(site)];
        const isHovered = hoveredId === site.id;
        const isSelected = selectedId === site.id;
        const dimmed = Boolean((hoveredId && !isHovered) || (panelOpen && !isSelected));
        const r = isHovered || isSelected ? 10 : 6;
        return (
          <g key={site.id} opacity={dimmed ? 0.35 : 1}>
            <circle cx={p.x} cy={p.y} r={r * 3.1} fill={color} opacity={isHovered ? 0.16 : 0.07} />
            <circle cx={p.x} cy={p.y} r={r * 1.7} fill="none" stroke={color} strokeOpacity="0.42" strokeWidth="1.4" />
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={color}
              stroke="var(--page)"
              strokeWidth="2.5"
              className="cursor-pointer transition-opacity"
              onPointerEnter={() => onHover(site.id)}
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
              onPointerEnter={() => onHover(site.id)}
              onClick={() => {
                onHover(site.id);
                onSelect(site);
              }}
            />
            {isHovered && approachedId !== site.id && (
              <foreignObject x={Math.min(780, p.x + 22)} y={Math.max(130, p.y - 52)} width="230" height="110" className="pointer-events-none overflow-visible">
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
              </foreignObject>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function WorldMap(props: Props) {
  const { sites, axes, selectedId, hoveredId, approachedId, onHover, onSelect, panelOpen, onApproach, onZoomStageChange } = props;
  const countries = useCountries();
  const { view, focus } = useAnimatedView(sites, hoveredId, selectedId);
  const lastStage = useRef<ZoomStage>("globe");
  const lastApproach = useRef<string | null>(null);
  const globeRadius = radiusFor(view.progress);

  useEffect(() => {
    const stage = stageFromProgress(view.progress, focus?.id ?? null);
    if (stage !== lastStage.current) {
      lastStage.current = stage;
      onZoomStageChange?.(stage, focus?.id ?? null);
    }
    const approach = stage === "site" ? focus?.id ?? null : null;
    if (approach !== lastApproach.current) {
      lastApproach.current = approach;
      onApproach?.(approach);
    }
  }, [focus?.id, onApproach, onZoomStageChange, view.progress]);

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
          <clipPath id="globeClip">
            <circle cx={CX} cy={CY} r={Math.min(globeRadius, 760)} />
          </clipPath>
        </defs>

        <rect width="1000" height="1000" fill="var(--page)" />
        <circle cx={CX} cy={CY} r={Math.min(globeRadius, 760)} fill="url(#globeOcean)" filter="url(#glow)" opacity="0.95" />
        <g clipPath="url(#globeClip)">
          <Graticule view={view} />
          <CountryLayer countries={countries} view={view} />
          <SurveyPlan view={view} site={focus} />
          <rect x="0" y="0" width="1000" height="1000" fill="url(#globeShade)" pointerEvents="none" />
        </g>
        <circle cx={CX} cy={CY} r={Math.min(globeRadius, 760)} fill="none" stroke="var(--primary)" strokeOpacity={0.22 - Math.min(view.progress * 0.18, 0.18)} strokeWidth="1.4" />

        <MarkerLayer
          sites={sites}
          axes={axes}
          view={view}
          hoveredId={hoveredId}
          selectedId={selectedId}
          approachedId={approachedId}
          onHover={onHover}
          onSelect={onSelect}
          panelOpen={panelOpen}
        />
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