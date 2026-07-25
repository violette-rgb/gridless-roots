import { useEffect, useRef } from "react";
import type { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const MARKERS: { lon: number; lat: number }[] = [
  { lon: -5.98, lat: 37.39 },
  { lon: -3.42, lat: 58.48 },
  { lon: -6.26, lat: 53.35 },
  { lon: 8.68, lat: 50.11 },
  { lon: 20.22, lat: 67.86 },
  { lon: 109.98, lat: 39.61 },
  { lon: -21.94, lat: 64.15 },
  { lon: 10.4, lat: 63.43 },
];

/** Decorative, non-interactive slowly spinning globe for the landing hero. */
export function HeroGlobe() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: MLMap | null = null;
    let raf = 0;
    let cancelled = false;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: [10, 35],
        zoom: 1.35,
        interactive: false,
        attributionControl: false,
      });
      const m = map;
      m.on("error", (e) => console.error("[hero-globe]", e?.error ?? e));
      m.on("load", () => {
        try {
          m.setProjection({ type: "globe" });
        } catch {
          /* projection unavailable — flat map still renders */
        }
        m.resize();
        m.addSource("hero-sites", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: MARKERS.map((p) => ({
              type: "Feature" as const,
              properties: {},
              geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
            })),
          },
        });
        m.addLayer({
          id: "hero-sites-glow",
          type: "circle",
          source: "hero-sites",
          paint: {
            "circle-radius": 9,
            "circle-color": "#5ee7de",
            "circle-opacity": 0.14,
            "circle-blur": 1,
          },
        });
        m.addLayer({
          id: "hero-sites-dot",
          type: "circle",
          source: "hero-sites",
          paint: { "circle-radius": 3, "circle-color": "#7fecdf", "circle-opacity": 0.9 },
        });

        let lon = 10;
        const spin = () => {
          lon = (lon + 0.035) % 360;
          m.setCenter([lon, 35]);
          raf = requestAnimationFrame(spin);
        };
        raf = requestAnimationFrame(spin);
      });
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      map?.remove();
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-[-18%] w-[85vw] max-w-[1100px] opacity-70 max-md:right-[-40%] max-md:opacity-40"
    >
      <div ref={container} className="h-full w-full" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 50%, rgba(7,9,12,0.95) 0%, rgba(7,9,12,0.55) 38%, transparent 62%)",
        }}
      />
    </div>
  );
}
