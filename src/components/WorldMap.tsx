import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  bestLolp,
  classify,
  formatLolp,
  VERDICT_COLOR,
  type Site,
} from "@/lib/offgrid-data";

const STYLE = {
  version: 8 as const,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    carto: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap · © CARTO · Terrain: Mapzen / AWS",
    },
    terrain: {
      type: "raster-dem" as const,
      tiles: [
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
      ],
      encoding: "terrarium" as const,
      tileSize: 256,
      maxzoom: 13,
    },
  },
  layers: [
    { id: "bg", type: "background" as const, paint: { "background-color": "#07090c" } },
    {
      id: "base",
      type: "raster" as const,
      source: "carto",
      paint: { "raster-opacity": 0.85, "raster-saturation": -0.5, "raster-contrast": 0.1 },
    },
    {
      id: "hillshade",
      type: "hillshade" as const,
      source: "terrain",
      paint: {
        "hillshade-exaggeration": 0.45,
        "hillshade-shadow-color": "#02040a",
        "hillshade-highlight-color": "#3d6f88",
        "hillshade-accent-color": "#0b1b26",
      },
    },
  ],
};

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

interface Props {
  sites: Site[];
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (site: Site) => void;
  panelOpen: boolean;
}

export function WorldMap({
  sites,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
  panelOpen,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

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
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE as never,
        center: [4, 52],
        zoom: 2.9,
        pitch: 0,
        attributionControl: { compact: true },
        maxPitch: 75,
      });
      mapRef.current = map;
      const m = map;
      m.on("load", () => {
        m.addSource("graticule", { type: "geojson", data: graticule() });
        m.addLayer({
          id: "graticule",
          type: "line",
          source: "graticule",
          paint: { "line-color": "#7fd6f2", "line-opacity": 0.07, "line-width": 0.5 },
        });
        m.setTerrain({ source: "terrain", exaggeration: 1.25 });
        setReady(true);
        project(m);
      });
      m.on("move", () => project(m));
      m.on("render", () => project(m));
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [project]);

  // Fly to selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const site = sites.find((s) => s.id === selectedId);
    if (!site) {
      map.easeTo({ center: [4, 52], zoom: 2.9, pitch: 0, bearing: 0, duration: 1600, padding: { left: 0, right: 0 } });
      return;
    }
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
    <div className="absolute inset-0">
      <div ref={container} className="absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {sites.map((site, i) => {
          const pos = positions[site.id];
          if (!pos) return null;
          const lolp = bestLolp(site);
          const color = VERDICT_COLOR[classify(lolp)];
          const isHovered = hoveredId === site.id;
          const isSelected = selectedId === site.id;
          const dimmed = (hoveredId && !isHovered) || (panelOpen && !isSelected);
          const flip = pos.x > window.innerWidth * 0.6;

          return (
            <div
              key={site.id}
              className="pointer-events-auto absolute"
              style={{
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%, -50%)",
                opacity: dimmed ? 0.28 : 1,
                transition: "opacity 300ms ease",
                zIndex: isHovered ? 30 : 10,
              }}
              onMouseEnter={() => onHover(site.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(site)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelect(site)}
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
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, x: flip ? 12 : -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-1/2 flex items-center gap-0"
                    style={
                      flip
                        ? { right: 10, flexDirection: "row-reverse" }
                        : { left: 10 }
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
                        <span className="text-xs opacity-40">% LOLP</span>
                      </div>
                      <div className="label-xs mt-1">best achievable</div>
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
