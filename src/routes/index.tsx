import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { WorldMap } from "@/components/WorldMap";
import { SiteDetail } from "@/components/SiteDetail";
import { loadDataset, type Site } from "@/lib/offgrid-data";
import { useHydrated } from "@/lib/hooks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Off-Grid Datacenter Siting — Europe" },
      {
        name: "description",
        content:
          "Where can a data center run entirely on its own wind, solar and storage? Eight European sites, 8760 hourly points each, one number: LOLP.",
      },
      { property: "og:title", content: "Off-Grid Datacenter Siting — Europe" },
      {
        property: "og:description",
        content:
          "Interactive siting instrument for grid-independent data centers: wind, solar, battery, and the loss-of-load probability that follows.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const hydrated = useHydrated();
  const { data, isError } = useQuery({
    queryKey: ["offgrid-dataset"],
    queryFn: loadDataset,
    staleTime: Infinity,
    enabled: hydrated,
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<Site | null>(null);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#07090c]">
      {data && (
        <WorldMap
          sites={data.sites}
          selectedId={selected?.id ?? null}
          hoveredId={hovered}
          onHover={setHovered}
          onSelect={setSelected}
          panelOpen={!!selected}
        />
      )}

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="pointer-events-none absolute left-8 top-8 z-30 max-w-sm"
      >
        <h1 className="text-2xl font-extralight tracking-tight">
          Off-grid datacenter siting
        </h1>
        <p className="label-xs mt-2">Europe · grid-independent compute</p>
        <p className="mt-5 max-w-xs text-[13px] font-light leading-relaxed text-foreground/50">
          Grid connection takes seven to ten years. This instrument asks where a data
          center can simply skip it — and what that costs.
        </p>
        <div className="mt-6 flex gap-4">
          <Key color="var(--viable)" text="Viable ≤ 1 %" />
          <Key color="var(--marginal)" text="Marginal" />
          <Key color="var(--failure)" text="Not viable" />
        </div>
        {!data && !isError && <p className="label-xs mt-6">Loading 8 sites…</p>}
        {isError && <p className="label-xs mt-6">Dataset unavailable.</p>}
      </motion.header>

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

      <footer className="label-xs pointer-events-none absolute bottom-5 left-8 z-30">
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
