import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SiteDetail } from "@/components/SiteDetail";
import { SiteFooter } from "@/components/SiteNav";
import {
  bestLolp,
  classify,
  formatLolp,
  loadDataset,
  VERDICT_COLOR,
} from "@/lib/offgrid-data";
import { useHydrated } from "@/lib/hooks";

export const Route = createFileRoute("/instrument")({
  head: () => ({
    meta: [
      { title: "Instrument — off-grid datacenter sizing" },
      {
        name: "description",
        content:
          "A full-screen sizing instrument for off-grid data centers: adjust IT load, turbines, solar and battery capacity, then inspect LOLP, deficit hours and CAPEX.",
      },
      { property: "og:title", content: "Instrument — off-grid datacenter sizing" },
      {
        property: "og:description",
        content:
          "Select a candidate site and compare wind, solar, battery and IT-load scenarios through loss-of-load probability, profile charts and a site concept model.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InstrumentPage,
});

function InstrumentPage() {
  const hydrated = useHydrated();
  const { data, isError } = useQuery({
    queryKey: ["offgrid-dataset"],
    queryFn: loadDataset,
    staleTime: Infinity,
    enabled: hydrated,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!data?.sites.length) return null;
    return data.sites.find((site) => site.id === selectedId) ?? data.sites[0];
  }, [data, selectedId]);

  return (
    <main className="min-h-screen bg-[#07090c]">
      <section className="px-6 pb-8 pt-28 md:px-10">
        <div className="mx-auto flex max-w-[1400px] items-end justify-between gap-6 border-b border-hairline pb-8">
          <div>
            <div className="label-xs">Instrument</div>
            <h1 className="mt-3 text-[clamp(2rem,4vw,3.8rem)] font-extralight leading-none tracking-[-0.03em]">
              Sizing console.
            </h1>
          </div>
          <Link
            to="/sites"
            className="hidden rounded-full border border-hairline px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] opacity-60 transition-opacity hover:opacity-100 sm:inline-block"
          >
            Back to globe
          </Link>
        </div>
      </section>

      <section className="px-6 pb-10 md:px-10">
        <div className="mx-auto grid max-w-[1400px] gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="panel overflow-hidden">
            <div className="border-b border-hairline px-5 py-5">
              <div className="label-xs">Candidate sites</div>
              <p className="mt-3 text-[12px] font-light leading-relaxed text-foreground/45">
                Select a site; the instrument stays open with viability, profile, physics
                and concept tabs ready.
              </p>
            </div>

            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
              {!data && !isError && <div className="label-xs px-5 py-5">Loading sites…</div>}
              {isError && <div className="label-xs px-5 py-5">Dataset unavailable.</div>}
              {data?.sites.map((site) => {
                const lolp = bestLolp(site);
                const color = VERDICT_COLOR[classify(lolp)];
                const active = selected?.id === site.id;

                return (
                  <button
                    key={site.id}
                    onClick={() => setSelectedId(site.id)}
                    className={`flex w-full items-center justify-between border-b border-hairline px-5 py-4 text-left transition-colors duration-200 ${
                      active ? "bg-primary/10" : "hover:bg-foreground/5"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-light">{site.nom}</span>
                      <span className="label-xs mt-1 block">{site.pays}</span>
                    </span>
                    <span className="num text-sm font-light" style={{ color }}>
                      {formatLolp(lolp)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {selected && data ? (
            <SiteDetail site={selected} data={data} embedded />
          ) : (
            <div className="panel flex h-[calc(100vh-8rem)] items-center justify-center">
              <div className="label-xs">Preparing instrument…</div>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}