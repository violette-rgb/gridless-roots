import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { WorldMap, type MapApi, type ZoomStage } from "@/components/WorldMap";
import { SiteDetail } from "@/components/SiteDetail";
import { SiteMaquette3D, siteArchetype } from "@/components/SiteMaquette3D";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks";
import type { BuildSpec } from "@/lib/site-model";
import {
  siteVerdict,
  formatLolp,
  referenceLolp,
  loadDataset,
  REFERENCE_BUILD,
  VERDICT_COLOR,
  type Site,
} from "@/lib/offgrid-data";

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "Site explorer — Off-grid datacenter siting" },
      {
        name: "description",
        content:
          "One map, four levels. Descend from a rotating globe to real terrain and watch the off-grid campus build itself on the mountainside.",
      },
      { property: "og:title", content: "Site explorer — Off-grid datacenter siting" },
      {
        property: "og:description",
        content:
          "Interactive globe of seventeen candidate European sites for grid-independent compute, with wind, solar, battery and LOLP for each.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SitesPage,
});

const STAGES: ZoomStage[] = ["globe", "country", "city", "site"];

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
  const [stage, setStage] = useState<ZoomStage>("globe");
  const [maquetteOpen, setMaquetteOpen] = useState(false);
  const [stageSiteId, setStageSiteId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [api, setApi] = useState<MapApi | null>(null);
  const [build, setBuild] = useState<BuildSpec>({
    turbines: REFERENCE_BUILD.turbines,
    pv_mw: REFERENCE_BUILD.pv_mw,
    batt_mwh: REFERENCE_BUILD.batt_mwh,
  });

  const onStageChange = useCallback((s: ZoomStage, siteId: string | null) => {
    setStage(s);
    setStageSiteId(siteId);
  }, []);
  const onBuild = useCallback((b: BuildSpec) => setBuild(b), []);
  const onReady = useCallback((a: MapApi) => setApi(a), []);
  const stageSite = stageSiteId ? (data?.sites.find((s) => s.id === stageSiteId) ?? null) : null;
  const current = selected ?? stageSite;

  const ordered = data?.sites ?? [];
  const goToGlobe = useCallback(() => {
    setSelected(null);
    setHovered(null);
    setMaquetteOpen(false);
    setStage("globe");
    setStageSiteId(null);
    api?.goToGlobe();
  }, [api]);
  const step = useCallback(
    (dir: 1 | -1) => {
      if (!ordered.length) return;
      const i = current ? ordered.findIndex((s) => s.id === current.id) : -1;
      const next = ordered[(i + dir + ordered.length) % ordered.length];
      setHovered(next.id);
      setSelected(next);
      api?.flyToSite(next);
    },
    [api, current, ordered],
  );

  const railHidden = !!selected && !railOpen;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-page">
      {data && hydrated && (
        <WorldMap
          sites={data.sites}
          axes={data.grille_axes}
          selectedId={selected?.id ?? null}
          hoveredId={hovered}
          onHover={setHovered}
          onSelect={setSelected}
          build={build}
          onStageChange={onStageChange}
          onReady={onReady}
        />
      )}

      {/* Navigation cluster — always reachable */}
      <div className="absolute left-1/2 bottom-6 z-50 flex -translate-x-1/2 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goToGlobe}
          disabled={stage === "globe" && !selected}
          className="rounded-full border-hairline bg-background/70 px-4 text-[11px] uppercase tracking-[0.16em] backdrop-blur-md disabled:opacity-40"
        >
          ← Globe
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => step(-1)}
          className="rounded-full border-hairline bg-background/70 px-3 text-[11px] uppercase tracking-[0.16em] backdrop-blur-md"
        >
          Prev
        </Button>
        <span className="num min-w-[150px] text-center text-[12px] opacity-80">
          {current ? `${current.nom} · ${current.pays}` : "17 sites"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => step(1)}
          className="rounded-full border-hairline bg-background/70 px-3 text-[11px] uppercase tracking-[0.16em] backdrop-blur-md"
        >
          Next
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRailOpen((v) => !v)}
          className="rounded-full border-hairline bg-background/70 px-4 text-[11px] uppercase tracking-[0.16em] backdrop-blur-md"
        >
          {railHidden ? "All sites" : "Hide list"}
        </Button>
      </div>

      {/* Site index rail */}
      <motion.aside
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: railHidden ? 0 : 1, x: railHidden ? -16 : 0 }}
        transition={{ duration: 0.4 }}
        className={`absolute left-6 top-28 z-40 w-[260px] md:left-10 ${
          railHidden ? "pointer-events-none" : ""
        }`}
      >

        <div className="label-xs">Candidate sites</div>
        <p className="mt-3 max-w-[240px] text-[12px] font-light leading-relaxed text-foreground/72">
          Hover a marker to descend one level — globe, country, city, site. At site level the
          map becomes real terrain and the campus is built on it. Click to open the instrument.
          The figure is LOLP for a common reference build — 40 turbines, 100 MWp, 800 MWh — at
          50 MW IT load.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
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
              const lolp = referenceLolp(data.grille_axes, s);
              const color = VERDICT_COLOR[siteVerdict(s)];
              const active = hovered === s.id;
              return (
                <li key={s.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    onPointerEnter={() => setHovered(s.id)}
                    onFocus={() => setHovered(s.id)}
                    onClick={() => {
                      setHovered(s.id);
                      setSelected(s);
                    }}
                    className={`group flex h-auto w-full items-baseline justify-between rounded-none border-b border-hairline px-0 py-2.5 text-left font-normal transition-opacity duration-300 hover:bg-transparent ${
                      active ? "opacity-100" : "opacity-70 hover:opacity-95"
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

        {!data && !isError && <p className="label-xs mt-6">Loading 17 sites…</p>}
        {isError && <p className="label-xs mt-6">Dataset unavailable.</p>}
      </motion.aside>

      {/* Descent readout */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: selected ? 0 : 1, y: selected ? -10 : 0 }}
        transition={{ duration: 0.35 }}
        className="panel pointer-events-none absolute left-1/2 top-24 z-30 w-[min(520px,calc(100vw-340px))] -translate-x-1/2 px-4 py-3"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="label-xs">
            {stageSite ? `${stageSite.nom} · ${stageSite.pays}` : "Globe overview"}
          </div>
          <div className="label-xs text-primary opacity-100">{stage}</div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {STAGES.map((s, i) => (
            <ScaleStep
              key={s}
              label={s}
              active={stage === s}
              done={STAGES.indexOf(stage) > i}
            />
          ))}
        </div>
      </motion.div>

      {/* Campus maquette — live 3D, expands on hover */}
      <AnimatePresence>
        {(selected || stageSite) && (
          <motion.div
            key="maquette"
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            onPointerEnter={() => setMaquetteOpen(true)}
            onPointerLeave={() => setMaquetteOpen(false)}
            onClick={() => setMaquetteOpen(true)}
            className={
              maquetteOpen
                ? "panel absolute left-1/2 top-1/2 z-40 h-[70vh] w-[70vw] -translate-x-1/2 -translate-y-1/2 px-6 pb-4 pt-4"
                : "panel absolute bottom-24 left-6 z-40 w-[300px] px-4 pb-3 pt-3 md:left-10"
            }
            style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
          >
            <div className="flex items-baseline justify-between">
              <div className="label-xs truncate">
                {current ? siteArchetype(current) : "campus"} maquette
              </div>
              <div className="label-xs shrink-0 pl-2 text-primary opacity-100">{current?.nom}</div>


            </div>
            <SiteMaquette3D
              site={(selected ?? stageSite) as Site}
              build={build}
              expanded={maquetteOpen}
              className={maquetteOpen ? "mt-1 h-[calc(70vh-84px)] w-full" : "mt-1 h-[172px] w-full"}
            />
            <div className="label-xs flex justify-between opacity-70">
              <span>{build.turbines} turbines</span>
              <span>{build.pv_mw} MWp</span>
              <span>{build.batt_mwh} MWh</span>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      <div className="pointer-events-none absolute bottom-16 left-6 z-30 flex gap-4 md:left-10">
        <Key color="var(--viable)" text="Viable ≤ 1 %" />
        <Key color="var(--marginal)" text="Marginal" />
        <Key color="var(--failure)" text="Not viable" />
      </div>


      <div
        className="transition-opacity duration-300"
        style={{
          opacity: maquetteOpen ? 0 : 1,
          pointerEvents: maquetteOpen ? "none" : undefined,
        }}
      >
      <AnimatePresence>
        {selected && data && (
          <SiteDetail
            key={selected.id}
            site={selected}
            data={data}
            onClose={() => setSelected(null)}
            onBuild={onBuild}
            onPickSite={(s) => {
              setHovered(s.id);
              setSelected(s);
            }}
          />
        )}
      </AnimatePresence>
      </div>

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
