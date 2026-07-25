import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteNav";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — why off-grid siting, and what this tool is not" },
      {
        name: "description",
        content:
          "Why we built a siting instrument for grid-independent data centers, what the simulation covers, and the limits of a single-year reanalysis.",
      },
      { property: "og:title", content: "About the off-grid siting instrument" },
      {
        property: "og:description",
        content:
          "Scope, assumptions and limits of a decision-support tool for grid-independent compute in Europe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="min-h-screen bg-[#07090c]">
      <section className="px-6 pb-16 pt-40 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="label-xs">About</div>
          <h1 className="mt-4 max-w-3xl text-[clamp(2.2rem,5vw,4rem)] font-extralight leading-[1.02] tracking-[-0.03em]">
            A siting instrument, not a spreadsheet.
          </h1>
        </div>
      </section>

      <section className="border-t border-hairline px-6 py-20 md:px-10">
        <div className="mx-auto grid max-w-[1400px] gap-16 md:grid-cols-2">
          <div className="space-y-6 text-[15px] font-light leading-relaxed text-foreground/60">
            <p>
              Compute capacity is being planned on eighteen-month horizons while
              transmission upgrades are planned on decade horizons. The gap is now the
              binding constraint on European datacenter development.
            </p>
            <p>
              Skipping the interconnection queue means accepting a physical truth: the
              site must carry its own load through the worst week of the year. This tool
              makes that week visible — the state of charge falling, the deficit hours
              accumulating, the sizing needed to prevent it.
            </p>
            <p>
              It is deliberately narrow. It does not price power purchase agreements,
              model curtailment revenue, or evaluate permitting risk. It answers one
              question with one number.
            </p>
          </div>

          <div className="space-y-8">
            <Note
              t="What it covers"
              d="Hourly wind, solar and thermal conditions; a Betz-limited turbine model with shear and air-density correction; temperature-derated PV; a cooling model whose PUE tracks ambient temperature; and a round-trip-efficiency battery integrated hour by hour."
            />
            <Note
              t="What it assumes"
              d="A constant IT load, a single meteorological year, no grid import, no diesel backup, and perfect foresight-free dispatch — charge when there is surplus, discharge when there is deficit."
            />
            <Note
              t="Where it is weakest"
              d="One year of reanalysis is not a climate distribution. A site that clears 1 % in 2023 may not clear it in a poor wind year. Treat rankings as robust and absolute values as indicative."
            />
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-[1400px]">
          <Link
            to="/instrument"
            className="rounded-full border border-primary/50 bg-primary/10 px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary/20"
          >
            Open the instrument
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Note({ t, d }: { t: string; d: string }) {
  return (
    <div className="border-t border-hairline pt-5">
      <h2 className="text-lg font-light tracking-tight">{t}</h2>
      <p className="mt-3 text-[13px] font-light leading-relaxed text-foreground/50">{d}</p>
    </div>
  );
}
