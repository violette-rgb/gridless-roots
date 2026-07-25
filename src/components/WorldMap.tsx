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
const INITIAL_CENTER: [number, number] = [10, 40];
const INITIAL_ZOOM = 1.55;


type LineFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: number[][] };
};

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
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);


  const project = useCallback(
    (map: MLMap) => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const s of sites) {
        const p = map.project([s.longitude, s.latitude]);
        next[s.id] = { x: p.x, y: p.y };
      }
      setPositions(next);
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
      event.preventDefault();
      setMapFailed(true);
      setReady(false);
    };
    const handleContextRestored = () => setMapEpoch((n) => n + 1);
    (async () => {
      setReady(false);
      setMapFailed(false);
      setPositions({});
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
      });
      mapRef.current = map;
      const m = map;
      canvas = m.getCanvas();
      canvas.addEventListener("webglcontextlost", handleContextLost, false);
      canvas.addEventListener("webglcontextrestored", handleContextRestored, false);
      resizeObserver = new ResizeObserver(() => m.resize());
      resizeObserver.observe(container.current);
      loadTimer = window.setTimeout(() => {
        if (!cancelled && !m.loaded()) setMapFailed(true);
      }, 7000);
      m.on("error", (e) => console.error("[maplibre]", e?.error ?? e));
      m.on("load", () => {
        window.clearTimeout(loadTimer);
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
          paint: { "line-color": "#7fd6f2", "line-opacity": 0.07, "line-width": 0.5 },
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
        paint("background", "background-color", "#334455");
        paint("landcover", "fill-color", "#3b4d5c");
        paint("landcover", "fill-opacity", 0.6);
        paint("park_national_park", "fill-opacity", 0.15);
        paint("park_nature_reserve", "fill-opacity", 0.15);
        paint("landuse", "fill-opacity", 0.12);
        paint("landuse_residential", "fill-opacity", 0.12);
        paint("water", "fill-color", "#0a1a26");
        paint("water_shadow", "fill-color", "#08151f");
        paint("waterway", "line-color", "#123244");
        for (const layer of m.getStyle().layers ?? []) {
          const id = layer.id;
          if (layer.type === "line" && /boundary/i.test(id)) {
            paint(id, "line-color", "#dff2fb");
            paint(id, "line-opacity", 0.5);
          } else if (layer.type === "symbol") {
            paint(id, "text-color", "#f2f8fc");
            paint(id, "text-halo-color", "#101d27");
            paint(id, "text-halo-width", 1.4);
          } else if (layer.type === "line" && /road|bridge|tunnel|rail|aeroway/i.test(id)) {
            paint(id, "line-opacity", 0.18);
          }
        }

        setMapFailed(false);
        setReady(true);
        setCenter(m.getCenter().toArray() as [number, number]);
        project(m);
      });
      m.on("move", () => {
        project(m);
        setCenter(m.getCenter().toArray() as [number, number]);
      });
      m.on("render", () => project(m));
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
  }, [project, mapEpoch]);

  const resetToGlobe = useCallback(() => {
    onHover(null);
    onApproach?.(null);
    const map = mapRef.current;
    if (!map || !ready) return;
    map.easeTo({
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
      duration: 1200,
    });
  }, [onApproach, onHover, ready]);

  const reloadMap = useCallback(() => {
    onHover(null);
    onApproach?.(null);
    setMapEpoch((n) => n + 1);
  }, [onApproach, onHover]);

  // Hover: cinematic descent — globe → country → city → site scale.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || selectedId) return;
    const site = sites.find((s) => s.id === hoveredId);
    if (!site) {
      onApproach?.(null);
      const t = setTimeout(
        () =>
          mapRef.current?.easeTo({
            center: INITIAL_CENTER,
            zoom: INITIAL_ZOOM,
            pitch: 0,
            bearing: 0,
            duration: 1600,
          }),
        220,
      );
      return () => clearTimeout(t);
    }
    const target: [number, number] = [site.longitude, site.latitude];
    // 1 — swing the globe over the country
    map.easeTo({ center: target, zoom: 4.2, pitch: 0, bearing: 0, duration: 850 });
    // 2 — city scale, camera tilts
    const t2 = setTimeout(() => {
      mapRef.current?.easeTo({ center: target, zoom: 7.6, pitch: 40, bearing: -12, duration: 950 });
    }, 900);
    // 3 — site scale, hand over to the physical maquette
    const t3 = setTimeout(() => {
      mapRef.current?.easeTo({ center: target, zoom: 11.2, pitch: 62, bearing: -24, duration: 1200 });
      onApproach?.(site.id);
    }, 1950);
    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [hoveredId, selectedId, ready, sites, onApproach]);

  // Fly to selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const site = sites.find((s) => s.id === selectedId);
    if (!site) return;
    map.flyTo({
      center: [site.longitude, site.latitude],
      zoom: 10.5,
      pitch: 55,
      bearing: -22,
      curve: 1.4,
      speed: 1,
      duration: 2200,
      essential: true,
      padding: { right: Math.round(window.innerWidth * 0.55), left: 0, top: 0, bottom: 0 },
    });
  }, [selectedId, ready, sites]);


  return (
    <div className="absolute inset-0 bg-page">
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
