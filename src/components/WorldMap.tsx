import { useCallback, useEffect, useRef } from "react";
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  VERDICT_COLOR,
  siteVerdict,
  referenceLolp,
  formatLolp,
  type GrilleAxes,
  type Site,
} from "@/lib/offgrid-data";
import { buildSiteGeoJSON, type BuildSpec } from "@/lib/site-model";

export type ZoomStage = "globe" | "country" | "city" | "site";

const LEVELS: { zoom: number; pitch: number; stage: ZoomStage }[] = [
  { zoom: 1.5, pitch: 0, stage: "globe" },
  { zoom: 5, pitch: 0, stage: "country" },
  { zoom: 9, pitch: 45, stage: "city" },
  { zoom: 13.5, pitch: 65, stage: "site" },
];

const DEM_SOURCE = "terrain-dem";
const MODEL_LAYERS: {
  id: string;
  key: "halls" | "batteries" | "solar" | "turbines";
  height: number;
  base: number;
  color: string;
  opacity: number;
}[] = [
  { id: "site-halls", key: "halls", height: 22, base: 0, color: "#c8cfe0", opacity: 0.9 },
  { id: "site-batteries", key: "batteries", height: 4, base: 0, color: "#8fa3b8", opacity: 0.9 },
  { id: "site-solar", key: "solar", height: 1.5, base: 0, color: "#1b3a5c", opacity: 0.85 },
  { id: "site-turbines", key: "turbines", height: 110, base: 0, color: "#e8edf5", opacity: 0.95 },
];

export interface MapApi {
  goToGlobe: () => void;
  flyToSite: (site: Site) => void;
}

interface Props {
  sites: Site[];
  axes: GrilleAxes;
  selectedId: string | null;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (site: Site) => void;
  build: BuildSpec;
  onStageChange?: (stage: ZoomStage, siteId: string | null) => void;
  onReady?: (api: MapApi) => void;
}


export function WorldMap({
  sites,
  axes,
  selectedId,
  hoveredId,
  onHover,
  onSelect,
  build,
  onStageChange,
  onReady,
}: Props) {

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markers = useRef<Map<string, { marker: MLMarker; el: HTMLDivElement }>>(new Map());
  const level = useRef(0);
  const focus = useRef<string | null>(null);
  const flying = useRef(false);
  const terrainOn = useRef(false);
  const siteOn = useRef(false);
  const lastEx = useRef(0);
  const dwell = useRef<number | null>(null);
  const climb = useRef<number | null>(null);
  const spinTarget = useRef(3);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const buildRef = useRef(build);
  buildRef.current = build;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onStageRef = useRef(onStageChange);
  onStageRef.current = onStageChange;

  /* ---------- terrain (from city level, zoom >= 8) ---------- */

  const enableTerrain = useCallback(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;
    if (!m.getSource(DEM_SOURCE)) {
      m.addSource(DEM_SOURCE, {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 15,
      });
    }
    if (!m.getLayer("hillshade")) {
      const firstSymbol = m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      m.addLayer(
        {
          id: "hillshade",
          type: "hillshade",
          source: DEM_SOURCE,
          paint: {
            "hillshade-exaggeration": 0.7,
            "hillshade-shadow-color": "#000000",
            "hillshade-highlight-color": "#1e3a4a",
          },
        },
        firstSymbol,
      );
    }
    const z = m.getZoom();
    // 1.2 at z8 -> 1.6 at z13
    const ex = 1.2 + ((Math.max(8, Math.min(13, z)) - 8) / 5) * 0.4;
    if (!terrainOn.current || Math.abs(ex - lastEx.current) > 0.03) {
      lastEx.current = ex;
      m.setTerrain({ source: DEM_SOURCE, exaggeration: ex });
    }
    terrainOn.current = true;
  }, []);

  const disableTerrain = useCallback(() => {
    const m = mapRef.current;
    if (!m || !terrainOn.current) return;
    m.setTerrain(null);
    if (m.getLayer("hillshade")) m.removeLayer("hillshade");
    terrainOn.current = false;
  }, []);

  /* ---------- level 4: the site model ---------- */

  const enableSite = useCallback(
    (site: Site) => {
      const m = mapRef.current;
      if (!m) return;
      enableTerrain();

      const geo = buildSiteGeoJSON(site, buildRef.current);
      for (const l of MODEL_LAYERS) {
        const data = geo[l.key] as never;
        const src = m.getSource(l.id) as { setData?: (d: never) => void } | undefined;
        if (src?.setData) {
          src.setData(data);
        } else {
          m.addSource(l.id, { type: "geojson", data });
          m.addLayer({
            id: l.id,
            type: "fill-extrusion",
            source: l.id,
            paint: {
              "fill-extrusion-color": l.color,
              "fill-extrusion-height": l.height,
              "fill-extrusion-base": l.base,
              "fill-extrusion-opacity": l.opacity,
            },
          });
        }
      }
      siteOn.current = true;
    },
    [enableTerrain],
  );

  const disableSite = useCallback(() => {
    const m = mapRef.current;
    if (!m || !siteOn.current) return;
    for (const l of MODEL_LAYERS) {
      if (m.getLayer(l.id)) m.removeLayer(l.id);
      if (m.getSource(l.id)) m.removeSource(l.id);
    }
    siteOn.current = false;
  }, []);


  /* ---------- camera ---------- */

  const goToLevel = useCallback(
    (n: number, site: Site | null, force = false) => {
      const m = mapRef.current;
      if (!m) return;
      if (flying.current && !force) return;
      const lv = Math.max(0, Math.min(3, n));
      const target = LEVELS[lv];
      if (lv > 0 && !site) return;
      if (lv < 3) disableSite();

      flying.current = true;
      level.current = lv;
      focus.current = lv > 0 && site ? site.id : null;
      spinTarget.current = lv === 0 ? 3 : 0;
      // fade every other marker out while the camera moves
      markers.current.forEach(({ el }, id) => {
        el.classList.toggle("is-flying", !!focus.current && id !== focus.current);
      });
      // the destination panel only appears in the last 600 ms of the flight
      window.setTimeout(() => onStageRef.current?.(target.stage, focus.current), 1400);
      m.flyTo({
        center: site && lv > 0 ? [site.longitude, site.latitude] : m.getCenter(),
        zoom: target.zoom,
        pitch: target.pitch,
        bearing: 0,
        duration: 2000,
        curve: 1.4,
        essential: true,
      });
      const done = () => {
        flying.current = false;
        markers.current.forEach(({ el }) => el.classList.remove("is-flying"));
        if (lv === 3 && site) enableSite(site);
      };
      m.once("moveend", done);
      window.setTimeout(done, 2400);
    },
    [disableSite, enableSite],
  );

  /* ---------- map bootstrap ---------- */

  useEffect(() => {
    let disposed = false;
    let map: MLMap | null = null;
    let raf = 0;
    let resizeObs: ResizeObserver | null = null;

    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (disposed || !container.current) return;
      map = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              ],
              tileSize: 256,
              maxzoom: 19,
              attribution: "© OpenStreetMap contributors © CARTO",
            },
          },
          layers: [
            { id: "bg", type: "background", paint: { "background-color": "#16222e" } },
            {
              id: "basemap",
              type: "raster",
              source: "basemap",
              paint: { "raster-brightness-min": 0.06, "raster-contrast": 0.15, "raster-saturation": -0.05, "raster-opacity": 1 },
            },
          ],
        },
        center: [10, 25],
        zoom: 1.5,
        pitch: 0,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on("error", (e) => console.error("[map]", e?.error ?? e));
      map.dragRotate.disable();

      const ro = new ResizeObserver(() => map?.resize());
      ro.observe(container.current);
      resizeObs = ro;

      map.on("load", () => {
        if (!map) return;
        map.resize();
        try {
          map.setProjection({ type: "globe" });
        } catch {
          /* projection unsupported */
        }
        try {
          map.setSky({
            "sky-color": "#05070a",
            "horizon-color": "#0d2635",
            "fog-color": "#07090C",
            "fog-ground-blend": 0.4,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0],
          });
        } catch {
          /* sky unsupported */
        }




        // markers
        for (const s of sitesRef.current) {
          const color = VERDICT_COLOR[siteVerdict(s)];
          const el = document.createElement("div");
          el.className = "site-marker";
          el.style.setProperty("--mk", color);
          el.style.setProperty("--phase", `${(Math.abs(s.latitude * 7) % 40) / 10}s`);
          el.innerHTML = `<span class="site-marker__ring"></span><span class="site-marker__dot"></span>
            <span class="site-marker__label"><span class="site-marker__line"></span>
              <span class="site-marker__text"><em>${s.nom}</em><i>${s.pays}</i>
              <b>${formatLolp(referenceLolp(axes, s))}%</b></span></span>`;
          el.addEventListener("pointerenter", () => {
            onHoverRef.current(s.id);
            spinTarget.current = 0;
            if (climb.current) window.clearTimeout(climb.current);
            if (dwell.current) window.clearTimeout(dwell.current);
            dwell.current = window.setTimeout(() => {
              goToLevel(level.current + 1, s);
            }, 400);
          });
          el.addEventListener("pointerleave", () => {
            if (dwell.current) window.clearTimeout(dwell.current);
            if (climb.current) window.clearTimeout(climb.current);
            climb.current = window.setTimeout(() => {
              onHoverRef.current(null);
              const s2 = focus.current
                ? (sitesRef.current.find((x) => x.id === focus.current) ?? null)
                : null;
              goToLevel(level.current - 1, level.current - 1 > 0 ? s2 : null);
            }, 800);
          });
          el.addEventListener("click", (ev) => {
            ev.stopPropagation();
            if (dwell.current) window.clearTimeout(dwell.current);
            el.classList.add("is-press");
            window.setTimeout(() => el.classList.remove("is-press"), 120);
            onHoverRef.current(s.id);
            onSelectRef.current(s);
            goToLevel(3, s);
          });
          const marker = new maplibregl.Marker({ element: el, anchor: "center" })
            .setLngLat([s.longitude, s.latitude])
            .addTo(map);
          markers.current.set(s.id, { marker, el });
        }
      });

      map.on("zoom", () => {
        const mm = mapRef.current;
        if (!mm) return;
        const z = mm.getZoom();
        if (z >= 8) enableTerrain();
        else disableTerrain();
      });

      map.on("mousedown", () => {
        spinTarget.current = 0;
        if (dwell.current) window.clearTimeout(dwell.current);
      });
      map.on("mousemove", () => {
        if (dwell.current) window.clearTimeout(dwell.current);
      });

      // autorotation
      let lastT = performance.now();
      let speed = 3;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const spin = (now: number) => {
        const dt = Math.min((now - lastT) / 1000, 0.1);
        lastT = now;
        if (map && !flying.current) {
          const t = map.getZoom() >= 3.5 || level.current > 0 ? 0 : spinTarget.current;
          speed += (t - speed) * Math.min(dt * 2.5, 1);
          if (speed > 0.01) {
            const c = map.getCenter();
            c.lng -= dt * speed;
            map.jumpTo({ center: c });
          }
        }
        raf = requestAnimationFrame(spin);
      };
      if (!reduce) raf = requestAnimationFrame(spin);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      if (dwell.current) window.clearTimeout(dwell.current);
      if (climb.current) window.clearTimeout(climb.current);
      markers.current.forEach(({ marker }) => marker.remove());
      markers.current.clear();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- imperative API for the page chrome ---------- */

  useEffect(() => {
    onReady?.({
      goToGlobe: () => {
        if (dwell.current) window.clearTimeout(dwell.current);
        if (climb.current) window.clearTimeout(climb.current);
        focus.current = null;
        goToLevel(0, null, true);
        onStageRef.current?.("globe", null);
      },
      flyToSite: (s: Site) => {
        if (dwell.current) window.clearTimeout(dwell.current);
        if (climb.current) window.clearTimeout(climb.current);
        goToLevel(3, s, true);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToLevel]);

  /* ---------- hover styling ---------- */


  useEffect(() => {
    markers.current.forEach(({ el }, id) => {
      const active = id === hoveredId || id === selectedId;
      el.classList.toggle("is-active", active);
      el.classList.toggle("is-dim", !!(hoveredId || selectedId) && !active);
    });
  }, [hoveredId, selectedId]);

  /* ---------- external hover (site rail) descends too ---------- */

  useEffect(() => {
    if (!hoveredId) return;
    const s = sitesRef.current.find((x) => x.id === hoveredId);
    if (!s) return;
    if (focus.current === hoveredId) return;
    const id = window.setTimeout(() => goToLevel(Math.max(1, level.current), s), 120);
    return () => window.clearTimeout(id);
  }, [hoveredId, goToLevel]);

  /* ---------- slider changes rebuild the model in place ---------- */

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !terrainOn.current || !focus.current) return;
    const s = sitesRef.current.find((x) => x.id === focus.current);
    if (!s) return;
    const geo = buildSiteGeoJSON(s, build);
    for (const l of MODEL_LAYERS) {
      const src = m.getSource(l.id) as { setData?: (d: unknown) => void } | undefined;
      src?.setData?.(geo[l.key]);
    }
  }, [build]);

  /* ---------- selection flies to the site ---------- */

  useEffect(() => {
    if (!selectedId) return;
    const s = sitesRef.current.find((x) => x.id === selectedId);
    if (s && focus.current !== selectedId) goToLevel(3, s);
  }, [selectedId, goToLevel]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      <div className="map-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
