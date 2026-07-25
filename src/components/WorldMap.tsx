import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Map as MLMap } from "maplibre-gl";
import { RefreshCw, RotateCcw } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import {
  referenceLolp,
  type GrilleAxes,
  siteVerdict,
  formatLolp,
  VERDICT_COLOR,
  type Site,
} from "@/lib/offgrid-data";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const INITIAL_CENTER: [number, number] = [10, 45];
const INITIAL_ZOOM = 2.05;

export type ZoomStage = "globe" | "country" | "city" | "site";


type LineFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: number[][] };
};

type PlanFeature = {
  type: "Feature";
  properties: { kind: "pad" | "pv" | "turbine" | "corridor" };
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "LineString"; coordinates: number[][] }
    | { type: "Point"; coordinates: number[] };
};

const emptyPlan = { type: "FeatureCollection" as const, features: [] as PlanFeature[] };

type GeoJsonSourceLike = { setData: (data: typeof emptyPlan) => void };

function isGeoJsonSource(source: unknown): source is GeoJsonSourceLike {
  return typeof source === "object" && source !== null && "setData" in source;
}

function graticule() {
  const features: LineFeature[] = [];
  for (let lon = -180; lon <= 180; lon += 10) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: Array.from({ length: 37 }, (_, i) => [lon, -85 + i * 5]),
      },
    });
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]),
      },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

const RAD = Math.PI / 180;
function angularDistance(a: [number, number], b: [number, number]) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const c =
    Math.sin(lat1 * RAD) * Math.sin(lat2 * RAD) +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lon2 - lon1) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
}

function hashSite(id: string) {
  return [...id].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 997, 17) / 997;
}

function offsetCoordinate(site: Site, eastKm: number, northKm: number): [number, number] {
  const lat = site.latitude + northKm / 111.32;
  const lon = site.longitude + eastKm / (111.32 * Math.max(0.18, Math.cos(site.latitude * RAD)));
  return [lon, lat];
}

function rotatedOffset(eastKm: number, northKm: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [eastKm * c - northKm * s, eastKm * s + northKm * c] as const;
}

function rectangle(site: Site, cx: number, cy: number, w: number, h: number, angle: number) {
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
    [-w / 2, -h / 2],
  ].map(([x, y]) => {
    const [rx, ry] = rotatedOffset(cx + x, cy + y, angle);
    return offsetCoordinate(site, rx, ry);
  });
  return corners;
}

function sitePlanFor(site: Site) {
  const seed = hashSite(site.id);
  const angle = seed * Math.PI * 2;
  const ridgeAngle = angle + Math.PI / 2.8;
  const features: PlanFeature[] = [];

  features.push({
    type: "Feature",
    properties: { kind: "pad" },
    geometry: { type: "Polygon", coordinates: [rectangle(site, 0, 0, 1.2, 0.82, angle)] },
  });

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      features.push({
        type: "Feature",
        properties: { kind: "pv" },
        geometry: {
          type: "Polygon",
          coordinates: [rectangle(site, -1.85 + col * 0.42, 0.95 + row * 0.23, 0.28, 0.14, angle)],
        },
      });
    }
  }

  const corridor: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const t = (i - 4.5) / 4.5;
    const wave = Math.sin((i + seed * 7) * 0.9) * 0.32;
    const [x, y] = rotatedOffset(t * 3.2, -1.15 + wave, ridgeAngle);
    const point = offsetCoordinate(site, x, y);
    corridor.push(point);
    if (i % 2 === 0 || i === 9) {
      features.push({
        type: "Feature",
        properties: { kind: "turbine" },
        geometry: { type: "Point", coordinates: point },
      });
    }
  }
  features.push({
    type: "Feature",
    properties: { kind: "corridor" },
    geometry: { type: "LineString", coordinates: corridor },
  });

  return { type: "FeatureCollection" as const, features };
}

interface Props {
  sites: Site[];
  axes: GrilleAxes;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (site: Site) => void;
  panelOpen: boolean;
  /** Fires once the camera has descended to site scale on a sustained hover. */
  onApproach?: (id: string | null) => void;
  /** Site whose maquette is on screen — its map tooltip is suppressed. */
  approachedId?: string | null;
  /** Reports the active descent scale: globe → country → city → site. */
  onZoomStageChange?: (stage: ZoomStage, siteId: string | null) => void;
}

export function WorldMap({
  sites,
  axes,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
  panelOpen,
  onApproach,
  approachedId,
  onZoomStageChange,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const loadedOnce = useRef(false);
  const flightTarget = useRef<string | null>(null);
  const stageRef = useRef<ZoomStage>("globe");
  const approachedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [zoomStage, setZoomStage] = useState<ZoomStage>("globe");

  const onHoverRef = useRef(onHover);
  const onApproachRef = useRef(onApproach);
  const onStageRef = useRef(onZoomStageChange);
  onHoverRef.current = onHover;
  onApproachRef.current = onApproach;
  onStageRef.current = onZoomStageChange;

  const updateStage = useCallback((stage: ZoomStage, siteId: string | null) => {
    if (stageRef.current === stage) return;
    stageRef.current = stage;
    setZoomStage(stage);
    onStageRef.current?.(stage, siteId);
  }, []);

  // Marker positions are written straight to the DOM — never through React
  // state — so a moving camera cannot re-render the page 60 times a second.
  const syncMarkers = useCallback(
    (m: MLMap) => {
      const c = m.getCenter();
      const centre: [number, number] = [c.lng, c.lat];
      const onGlobe = m.getZoom() < 5.5;
      for (const s of sites) {
        const el = markerRefs.current[s.id];
        if (!el) continue;
        const p = m.project([s.longitude, s.latitude]);
        const behind = onGlobe && angularDistance(centre, [s.longitude, s.latitude]) > 78;
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
        el.style.visibility = behind ? "hidden" : "visible";
      }
    },
    [sites],
  );

  useEffect(() => {
    let map: MLMap | null = null;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let loadTimer = 0;
    let canvas: HTMLCanvasElement | null = null;
    const handleContextLost = (event: Event) => {
      // Let the browser hand the context back instead of tearing the globe down.
      event.preventDefault();
    };
    const handleContextRestored = () => {
      mapRef.current?.resize();
      mapRef.current?.triggerRepaint();
    };
    (async () => {
      setMapFailed(false);
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        pitch: 0,
        attributionControl: { compact: true },
        maxPitch: 75,
        fadeDuration: 120,
        antialias: true,
      });
      mapRef.current = map;
      const m = map;
      canvas = m.getCanvas();
      canvas.addEventListener("webglcontextlost", handleContextLost, false);
      canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
      resizeObserver = new ResizeObserver(() => m.resize());
      resizeObserver.observe(container.current);
      loadTimer = window.setTimeout(() => {
        if (!cancelled && !loadedOnce.current) setMapFailed(true);
      }, 9000);
      m.on("error", (e) => console.error("[maplibre]", e?.error ?? e));
      m.on("load", () => {
        window.clearTimeout(loadTimer);
        loadedOnce.current = true;
        m.resize();
        try {
          m.setProjection({ type: "globe" });
        } catch (e) {
          console.error("[maplibre] globe projection unavailable", e);
        }
        m.addSource("graticule", { type: "geojson", data: graticule() });
        m.addLayer({
          id: "graticule",
          type: "line",
          source: "graticule",
          paint: { "line-color": "#7fd6f2", "line-opacity": 0.13, "line-width": 0.55 },
        });
        m.addSource("site-plan", { type: "geojson", data: emptyPlan });
        m.addLayer({
          id: "site-plan-fill",
          type: "fill",
          source: "site-plan",
          filter: ["in", ["get", "kind"], ["literal", ["pad", "pv"]]],
          paint: {
            "fill-color": ["match", ["get", "kind"], "pad", "#e9f7ff", "pv", "#1ab4e8", "#7fd6f2"],
            "fill-opacity": ["match", ["get", "kind"], "pad", 0.78, "pv", 0.44, 0.3],
          },
        });
        m.addLayer({
          id: "site-plan-line",
          type: "line",
          source: "site-plan",
          filter: ["==", ["get", "kind"], "corridor"],
          paint: { "line-color": "#7fd6f2", "line-opacity": 0.8, "line-width": 2, "line-dasharray": [1.2, 1] },
        });
        m.addLayer({
          id: "site-plan-turbines",
          type: "circle",
          source: "site-plan",
          filter: ["==", ["get", "kind"], "turbine"],
          paint: {
            "circle-color": "#f8fbff",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 12, 6],
            "circle-stroke-color": "#7fd6f2",
            "circle-stroke-width": 1.4,
            "circle-opacity": 0.95,
          },
        });
        // In dark-matter the background IS the land, and water is painted over
        // it. Push them apart so continents read clearly on the globe.
        const paint = (id: string, prop: string, value: string | number) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (m.getLayer(id)) (m as any).setPaintProperty(id, prop, value);
          } catch {
            /* layer does not support this paint property */
          }
        };
        paint("background", "background-color", "#405463");
        paint("landcover", "fill-color", "#526a7a");
        paint("landcover", "fill-opacity", 0.72);
        paint("park_national_park", "fill-opacity", 0.24);
        paint("park_nature_reserve", "fill-opacity", 0.24);
        paint("landuse", "fill-opacity", 0.2);
        paint("landuse_residential", "fill-opacity", 0.2);
        paint("water", "fill-color", "#0a1a26");
        paint("water_shadow", "fill-color", "#08151f");
        paint("waterway", "line-color", "#123244");
        for (const layer of m.getStyle().layers ?? []) {
          const id = layer.id;
          if (layer.type === "line" && /boundary/i.test(id)) {
            paint(id, "line-color", "#dff2fb");
            paint(id, "line-opacity", 0.72);
          } else if (layer.type === "symbol") {
            paint(id, "text-color", "#f2f8fc");
            paint(id, "text-halo-color", "#101d27");
            paint(id, "text-halo-width", 1.4);
          } else if (layer.type === "line" && /road|bridge|tunnel|rail|aeroway/i.test(id)) {
            paint(id, "line-opacity", 0.28);
          }
        }

        setMapFailed(false);
        setReady(true);
        syncMarkers(m);
      });
      // DOM-only work: safe to run every frame.
      m.on("render", () => syncMarkers(m));
      // Stage read from the live camera altitude, so labels track the single
      // continuous flight instead of driving it.
      m.on("zoom", () => {
        const z = m.getZoom();
        const id = flightTarget.current;
        const stage: ZoomStage = !id ? "globe" : z < 3.4 ? "globe" : z < 6.6 ? "country" : z < 10.4 ? "city" : "site";
        updateStage(stage, id);
        if (id && stage === "site" && approachedRef.current !== id) {
          approachedRef.current = id;
          onApproachRef.current?.(id);
        } else if (stage !== "site" && approachedRef.current) {
          approachedRef.current = null;
          onApproachRef.current?.(null);
        }
      });
      requestAnimationFrame(() => m.resize());
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
      resizeObserver?.disconnect();
      canvas?.removeEventListener("webglcontextlost", handleContextLost, false);
      canvas?.removeEventListener("webglcontextrestored", handleContextRestored, false);
      map?.remove();
      mapRef.current = null;
    };
  }, [syncMarkers, updateStage, mapEpoch]);

  const resetToGlobe = useCallback(() => {
    onHoverRef.current(null);
    approachedRef.current = null;
    onApproachRef.current?.(null);
    flightTarget.current = null;
    updateStage("globe", null);
    const map = mapRef.current;
    if (!map || !ready) return;
    map.stop();
    map.easeTo({
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      duration: 1600,
      essential: true,
    });
  }, [ready, updateStage]);

  const reloadMap = useCallback(() => {
    onHoverRef.current(null);
    approachedRef.current = null;
    onApproachRef.current?.(null);
    flightTarget.current = null;
    updateStage("globe", null);
    loadedOnce.current = false;
    setReady(false);
    setMapEpoch((n) => n + 1);
  }, [updateStage]);

  // Hover: ONE continuous flight from globe altitude down to site scale.
  // A single flyTo keeps the camera velocity continuous — no restarts, no snap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || selectedId) return;
    const site = sites.find((s) => s.id === hoveredId);

    if (!site) {
      const t = window.setTimeout(() => {
        flightTarget.current = null;
        const m = mapRef.current;
        if (!m) return;
        m.stop();
        m.easeTo({
          center: INITIAL_CENTER,
          zoom: INITIAL_ZOOM,
          pitch: 0,
          bearing: 0,
          duration: 2000,
          essential: true,
        });
      }, 260);
      return () => window.clearTimeout(t);
    }

    // Debounce so scanning down the site list does not launch a flight per row.
    const t = window.setTimeout(() => {
      const m = mapRef.current;
      if (!m) return;
      flightTarget.current = site.id;
      const source = m.getSource("site-plan");
      if (isGeoJsonSource(source)) source.setData(sitePlanFor(site));
      m.stop();
      m.flyTo({
        center: [site.longitude, site.latitude],
        zoom: 12.2,
        pitch: 62,
        bearing: -20,
        duration: 5200,
        curve: 1.45,
        speed: 0.9,
        screenSpeed: undefined,
        easing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
        padding: {
          left: Math.min(340, Math.round(window.innerWidth * 0.28)),
          right: Math.min(90, Math.round(window.innerWidth * 0.06)),
          top: 90,
          bottom: 110,
        },
        essential: true,
      });
    }, 150);
    return () => window.clearTimeout(t);
  }, [hoveredId, selectedId, ready, sites]);

  // Fly to selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const site = sites.find((s) => s.id === selectedId);
    if (!site) return;
    flightTarget.current = site.id;
    updateStage("site", site.id);
    approachedRef.current = null;
    onApproachRef.current?.(null);
    map.stop();
    const source = map.getSource("site-plan");
    if (isGeoJsonSource(source)) source.setData(sitePlanFor(site));
    map.flyTo({
      center: [site.longitude, site.latitude],
      zoom: 10.5,
      pitch: 55,
      bearing: -22,
      curve: 1.45,
      duration: 3200,
      easing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
      essential: true,
      padding: { right: Math.round(window.innerWidth * 0.55), left: 0, top: 0, bottom: 0 },
    });
  }, [selectedId, ready, sites, updateStage]);



  return (
    <div className="absolute inset-0 bg-page" data-map-stage={zoomStage}>
      <FallbackGlobe active={!ready || mapFailed} />
      <div
        ref={container}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
          mapFailed ? "opacity-0" : ready ? "opacity-100" : "opacity-25"
        }`}
      />
      <div className="vignette pointer-events-none absolute inset-0" />

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
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={reloadMap}
          aria-label="Reload globe"
          title="Reload globe"
          className="rounded-full border-hairline bg-background/55 text-foreground/80 backdrop-blur-xl hover:bg-accent"
        >
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>

      {mapFailed && (
        <div className="panel absolute left-1/2 top-1/2 z-30 max-w-sm -translate-x-1/2 -translate-y-1/2 p-5 text-center">
          <div className="label-xs text-primary opacity-100">Globe fallback active</div>
          <p className="mt-3 text-sm font-light leading-relaxed text-foreground/75">
            The vector basemap did not stay available in this browser session. The candidate
            sites remain usable; reload the globe when the preview settles.
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {sites.map((site, i) => {
          const pos = positions[site.id];
          if (!pos) return null;
          if (angularDistance(center, [site.longitude, site.latitude]) > 78) return null;

          const lolp = referenceLolp(axes, site);
          const color = VERDICT_COLOR[siteVerdict(site)];
          const isHovered = hoveredId === site.id;
          const isSelected = selectedId === site.id;
          const dimmed = (hoveredId && !isHovered) || (panelOpen && !isSelected);
          const flip = pos.x > window.innerWidth * 0.6;

          return (
            <div
              key={site.id}
              className="pointer-events-auto absolute flex h-11 w-11 items-center justify-center"
              style={{
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%, -50%)",
                opacity: dimmed ? 0.28 : 1,
                transition: "opacity 300ms ease",
                zIndex: isHovered ? 30 : 10,
              }}
              onPointerEnter={() => onHover(site.id)}
              onFocus={() => onHover(site.id)}
              onClick={() => {
                onHover(site.id);
                onSelect(site);
              }}
              role="button"
              aria-label={`${site.nom}, ${site.pays}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onHover(site.id);
                  onSelect(site);
                }
              }}
            >
              <span
                className="pulse-ring absolute left-1/2 top-1/2 block h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                style={{ borderColor: color, animationDelay: `${i * 0.5}s` }}
              />
              <span
                className="block cursor-pointer rounded-full transition-all duration-200"
                style={{
                  width: isHovered || isSelected ? 14 : 9,
                  height: isHovered || isSelected ? 14 : 9,
                  background: color,
                  boxShadow: `0 0 ${isHovered ? 26 : 14}px ${color}`,
                }}
              />

              <AnimatePresence>
                {isHovered && approachedId !== site.id && (
                  <motion.div
                    initial={{ opacity: 0, x: flip ? 12 : -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-1/2 flex items-center gap-0"
                    style={
                      flip
                        ? { right: 30, flexDirection: "row-reverse" }
                        : { left: 30 }
                    }
                  >
                    <span
                      className="block h-px w-10"
                      style={{ background: color, opacity: 0.6 }}
                    />
                    <div className="panel whitespace-nowrap px-4 py-2.5">
                      <div className="label-xs">
                        {site.nom} · {site.pays}
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span
                          className="num text-3xl font-extralight leading-none"
                          style={{ color }}
                        >
                          {formatLolp(lolp)}
                        </span>
                        <span className="text-xs opacity-65">% LOLP</span>
                      </div>
                      <div className="label-xs mt-1">reference build · 50 MW</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FallbackGlobe({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-700 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    >
      <svg
        viewBox="0 0 520 520"
        className="h-[min(70vw,70vh)] w-[min(70vw,70vh)] text-primary"
        role="img"
      >
        <defs>
          <radialGradient id="fallback-globe-core" cx="50%" cy="45%" r="58%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="58%" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </radialGradient>
        </defs>
        <circle cx="260" cy="260" r="226" fill="url(#fallback-globe-core)" />
        <circle cx="260" cy="260" r="226" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.2" />
        {[-120, -80, -40, 0, 40, 80, 120].map((x) => (
          <ellipse
            key={`lon-${x}`}
            cx="260"
            cy="260"
            rx={Math.max(12, 226 * Math.cos((Math.abs(x) / 140) * (Math.PI / 2)))}
            ry="226"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="0.8"
          />
        ))}
        {[-120, -80, -40, 0, 40, 80, 120].map((y) => (
          <ellipse
            key={`lat-${y}`}
            cx="260"
            cy="260"
            rx="226"
            ry={Math.max(12, 226 * Math.cos((Math.abs(y) / 140) * (Math.PI / 2)))}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="0.8"
          />
        ))}
        <path
          d="M190 145c36-20 87-11 112 10 24 21 13 43-10 54-23 12-55 8-75 27-19 18-21 48-50 56-30 8-67-12-74-45-8-39 42-73 97-102Zm136 106c41-10 85 6 104 40 19 35 2 78-34 93-42 17-99-2-111-42-12-41 2-81 41-91Zm-111 113c33-9 73 4 87 29 15 27-7 55-43 61-39 7-82-10-90-40-6-23 12-41 46-50Z"
          fill="currentColor"
          opacity="0.18"
        />
        <path
          d="M102 292c34 18 58 33 94 28M338 159c38 8 68 22 91 44M322 436c28-11 53-29 74-53"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="1.4"
        />
      </svg>
    </div>
  );
}
