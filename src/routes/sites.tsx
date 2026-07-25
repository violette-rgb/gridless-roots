import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useCallback, useState } from "react";
import { terrainFor } from "@/lib/terrain";

const SiteConcept = lazy(() => import("@/components/tabs/SiteConcept"));
import { WorldMap } from "@/components/WorldMap";
import { SiteDetail } from "@/components/SiteDetail";
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
  const onApproach = useCallback((id: string | null) => setApproached(id), []);
  const maquette =
    !selected && approached && approached === hovered
      ? (data?.sites.find((s) => s.id === approached) ?? null)
      : null;

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
          Hover a row to swing the globe over its country. Click to open the instrument.
          The figure is LOLP for a common reference build — 40 turbines, 100 MWp, 800 MWh — at 50 MW IT load, so sites are comparable.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => data?.sites[0] && setSelected(data.sites[0])}
            className="rounded-full border border-primary/40 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-primary transition-colors duration-200 hover:bg-primary/10"
          >
            Open instrument
          </button>
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
                  <button
                    onMouseEnter={() => setHovered(s.id)}
                    onFocus={() => setHovered(s.id)}
                    onClick={() => {
                      setHovered(s.id);
                      setSelected(s);
                    }}
                    className={`group flex w-full items-baseline justify-between border-b border-hairline py-2.5 text-left transition-opacity duration-200 ${
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
                  </button>
                </li>
              );
            })}
        </ul>

        {!data && !isError && <p className="label-xs mt-6">Loading 18 sites…</p>}
        {isError && <p className="label-xs mt-6">Dataset unavailable.</p>}
      </motion.aside>

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
            <Suspense
              fallback={
                <div className="label-xs flex h-[240px] items-center justify-center">
                  Building terrain…
                </div>
              }
            >
              <SiteConcept
                siteId={maquette.id}
                latitude={maquette.latitude}
                turbines={50}
                pv={100}
                batt={800}
                pIt={50}
                heightClass="h-[240px]"
              />
            </Suspense>
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
