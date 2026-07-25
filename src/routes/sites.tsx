import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { terrainFor } from "@/lib/terrain";
import { WorldMap, type ZoomStage } from "@/components/WorldMap";
import { SiteDetail } from "@/components/SiteDetail";
import { Button } from "@/components/ui/button";
import {
  siteVerdict,
  formatLolp,
  referenceLolp,
  loadDataset,
  VERDICT_COLOR,
  type Site,
} from "@/lib/offgrid-data";

import { useHydrated } from "@/lib/hooks";

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "Site explorer — Off-grid datacenter siting" },
      {
        name: "description",
        content:
          "Rotate the globe, hover a candidate site and watch the camera settle over its country. Eighteen European locations, one number: loss-of-load probability.",
      },
      { property: "og:title", content: "Site explorer — Off-grid datacenter siting" },
      {
        property: "og:description",
        content:
          "Interactive globe of eighteen candidate sites for grid-independent compute, with wind, solar, battery and LOLP for each.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SitesPage,
});

function SitesPage() {
  const hydrated = useHydrated();
  const { data, isError } = useQuery({
    queryKey: ["offgrid-dataset"],
    queryFn: loadDataset,
    staleTime: Infinity,
    enabled: hydrated,
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<Site | null>(null);
  const [approached, setApproached] = useState<string | null>(null);
  const [zoomStage, setZoomStage] = useState<ZoomStage>("globe");
  const [zoomSiteId, setZoomSiteId] = useState<string | null>(null);
  const onApproach = useCallback((id: string | null) => setApproached(id), []);
  const onZoomStageChange = useCallback((stage: ZoomStage, siteId: string | null) => {
    setZoomStage(stage);
    setZoomSiteId(siteId);
  }, []);
  const returnToGlobe = useCallback(() => {
    setHovered(null);
    setApproached(null);
    setSelected(null);
    setZoomStage("globe");
    setZoomSiteId(null);
  }, []);
  const maquette =
    !selected && approached && approached === hovered
      ? (data?.sites.find((s) => s.id === approached) ?? null)
      : null;
  const zoomSite = zoomSiteId ? (data?.sites.find((s) => s.id === zoomSiteId) ?? null) : null;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-page">
      {data && (
        <WorldMap
          sites={data.sites}
          axes={data.grille_axes}
          selectedId={selected?.id ?? null}
          hoveredId={hovered}
          onHover={setHovered}
          onSelect={setSelected}
          panelOpen={!!selected}
          onApproach={onApproach}
          approachedId={maquette?.id ?? null}
          onZoomStageChange={onZoomStageChange}
        />
      )}

      {/* Site index rail */}
      <motion.aside
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: selected ? 0 : 1, x: selected ? -16 : 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="absolute left-6 top-28 z-30 w-[260px] md:left-10"
      >
        <div className="label-xs">Candidate sites</div>
        <p className="mt-3 max-w-[240px] text-[12px] font-light leading-relaxed text-foreground/72">
          Hover or tap a row to descend: globe, country, city, then site maquette. Click to open the instrument.
          The figure is LOLP for a common reference build — 40 turbines, 100 MWp, 800 MWh — at 50 MW IT load, so sites are comparable.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={returnToGlobe}
            className="rounded-full border-primary/40 bg-primary/10 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-primary hover:bg-primary/20"
          >
            Globe overview
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => data?.sites[0] && setSelected(data.sites[0])}
            className="rounded-full border-primary/40 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-primary hover:bg-primary/10"
          >
            Open instrument
          </Button>
          <Link
            to="/guide"
            className="rounded-full border border-hairline px-4 py-2 text-[11px] uppercase tracking-[0.16em] opacity-75 transition-opacity hover:opacity-100"
          >
            Guide
          </Link>
        </div>
        <ul className="mt-5 max-h-[44vh] space-y-px overflow-y-auto pr-1">
          {data?.sites
            .slice()
            .sort((a, b) => referenceLolp(data.grille_axes, a) - referenceLolp(data.grille_axes, b))
            .map((s) => {
              const lolp = referenceLolp(data!.grille_axes, s);
              const color = VERDICT_COLOR[siteVerdict(s)];
              const active = hovered === s.id;
              return (
                <li key={s.id}>
                  <Button
                    type="button"
                    variant="ghost"
                      onMouseEnter={() => setHovered(s.id)}
                      onPointerEnter={() => setHovered(s.id)}
                    onFocus={() => setHovered(s.id)}
                    onClick={() => {
                      setHovered(s.id);
                      setSelected(s);
                    }}
                    className={`group flex h-auto w-full items-baseline justify-between rounded-none border-b border-hairline px-0 py-2.5 text-left font-normal hover:bg-transparent ${
                      active ? "opacity-100" : "opacity-75 hover:opacity-95"
                    }`}
                  >
                    <span className="flex items-baseline gap-2.5">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: color,
                          boxShadow: active ? `0 0 12px ${color}` : "none",
                        }}
                      />
                      <span className="text-[13px] font-light">{s.nom}</span>
                      <span className="label-xs">{s.pays}</span>
                    </span>
                    <span className="num text-[12px]" style={{ color }}>
                      {formatLolp(lolp)}%
                    </span>
                  </Button>
                </li>
              );
            })}
        </ul>

        {!data && !isError && <p className="label-xs mt-6">Loading 18 sites…</p>}
        {isError && <p className="label-xs mt-6">Dataset unavailable.</p>}
      </motion.aside>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: selected ? 0 : 1, y: selected ? -10 : 0 }}
        transition={{ duration: 0.35 }}
        className="panel absolute left-1/2 top-24 z-30 w-[min(560px,calc(100vw-340px))] -translate-x-1/2 px-4 py-3"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="label-xs">
            {zoomSite ? `${zoomSite.nom} · ${zoomSite.pays}` : "Globe overview"}
          </div>
          <div className="label-xs text-primary opacity-100">{zoomStage}</div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <ScaleStep label="Globe" active={zoomStage === "globe"} done={zoomStage !== "globe"} />
          <ScaleStep label="Country" active={zoomStage === "country"} done={zoomStage === "city" || zoomStage === "site"} />
          <ScaleStep label="City" active={zoomStage === "city"} done={zoomStage === "site"} />
          <ScaleStep label="Site" active={zoomStage === "site"} done={false} />
        </div>
      </motion.div>

      <div className="pointer-events-none absolute bottom-16 left-6 z-30 flex gap-4 md:left-10">
        <Key color="var(--viable)" text="Viable ≤ 1 %" />
        <Key color="var(--marginal)" text="Marginal" />
        <Key color="var(--failure)" text="Not viable" />
      </div>

      {/* Architectural maquette — appears once the camera has landed on the site */}
      <AnimatePresence>
        {maquette && (
          <motion.div
            key={maquette.id}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="panel absolute bottom-24 right-6 z-40 w-[380px] overflow-hidden p-3 md:right-10 md:w-[440px]"
          >
            <div className="flex items-baseline justify-between px-1 pb-2">
              <div className="label-xs">
                {maquette.nom} · {maquette.pays} · site maquette
              </div>
              <div className="label-xs">
                {terrainFor(maquette.id, maquette.latitude).landform.replace("-", " ")}
              </div>
            </div>
            <MiniMaquette site={maquette} />
            <p className="px-1 pt-2 text-[11px] font-light leading-relaxed text-foreground/70">
              6 km survey square on the site's own relief —{" "}
              {terrainFor(maquette.id, maquette.latitude).relief} m of it. Rotors take the
              exposed ridges, panels the gentle south slopes, halls the graded pad. Click
              the site to open the full instrument.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && data && (
          <SiteDetail
            key={selected.id}
            site={selected}
            data={data}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>

      <footer className="label-xs pointer-events-none absolute bottom-5 left-6 z-30 md:left-10">
        Open-Meteo / ERA5 — 2023 — 8760 hourly points per site
      </footer>
    </main>
  );
}

function Key({ color, text }: { color: string; text: string }) {
  return (
    <span className="label-xs flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}

function ScaleStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="min-w-0">
      <div
        className={`h-1 rounded-full transition-colors duration-300 ${
          active || done ? "bg-primary" : "bg-muted"
        }`}
      />
      <div className={`label-xs mt-2 truncate ${active ? "text-primary opacity-100" : "opacity-55"}`}>
        {label}
      </div>
    </div>
  );
}

function MiniMaquette({ site }: { site: Site }) {
  const terrain = terrainFor(site.id, site.latitude);
  const rugged = terrain.ruggedness;
  const turbines = rugged > 0.72 ? [-118, -72, -18, 46, 104] : [-128, -82, -34, 24, 82, 134];
  const panels = rugged > 0.62 ? 14 : 24;
  const contours = Array.from({ length: 11 }, (_, i) => {
    const y = 26 + i * 17;
    const bend = rugged * 22;
    return `M-190 ${y} C-122 ${y - bend + i * 1.5} -70 ${y + bend * 0.4} 0 ${y - rugged * 14} C68 ${y - bend * 0.3} 128 ${y + bend} 190 ${y - rugged * 5}`;
  });

  return (
    <div className="h-[240px] overflow-hidden rounded-xl border border-hairline bg-background/80">
      <svg className="h-full w-full" viewBox="0 0 420 240" role="img" aria-label={`${site.nom} topographic site maquette`}>
        <rect width="420" height="240" fill="var(--page)" />
        <g transform="translate(210 18)">
          <path d="M-188 182 L-148 42 L-18 10 L134 36 L190 182 Z" fill="var(--muted)" opacity="0.58" />
          <path d="M-188 182 L-148 42 L-18 10 L134 36 L190 182 Z" fill="none" stroke="var(--primary)" strokeOpacity="0.24" />
          {contours.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="var(--primary)" strokeOpacity={i % 3 === 0 ? 0.42 : 0.22} strokeWidth={i % 3 === 0 ? 1.2 : 0.8} />
          ))}
          <g transform="translate(-18 118) rotate(-4)">
            <rect x="-48" y="-18" width="96" height="40" rx="3" fill="var(--foreground)" opacity="0.82" />
            <rect x="-39" y="-10" width="34" height="12" fill="var(--page)" opacity="0.82" />
            <rect x="4" y="-10" width="34" height="12" fill="var(--page)" opacity="0.82" />
            <rect x="-39" y="8" width="77" height="7" fill="var(--primary)" opacity="0.35" />
          </g>
          <g transform="translate(-104 146) rotate(-11)">
            {Array.from({ length: panels }, (_, i) => (
              <rect key={i} x={(i % 8) * 14} y={Math.floor(i / 8) * 11} width="10" height="6" fill="var(--primary)" opacity="0.72" />
            ))}
          </g>
          {turbines.map((x, i) => (
            <g key={x} transform={`translate(${x} ${55 + Math.sin(i * 1.4) * 14})`} opacity="0.92">
              <line y1="34" y2="0" stroke="var(--foreground)" strokeWidth="1.8" />
              <circle r="5.5" fill="none" stroke="var(--foreground)" strokeWidth="1.6" />
              <line x1="0" y1="0" x2="0" y2="-13" stroke="var(--foreground)" strokeWidth="1.3" />
              <line x1="0" y1="0" x2="11" y2="6" stroke="var(--foreground)" strokeWidth="1.3" />
              <line x1="0" y1="0" x2="-11" y2="6" stroke="var(--foreground)" strokeWidth="1.3" />
            </g>
          ))}
          <rect x="-192" y="16" width="384" height="180" fill="none" stroke="var(--primary)" strokeDasharray="5 8" strokeOpacity="0.3" />
        </g>
      </svg>
    </div>
  );
}
