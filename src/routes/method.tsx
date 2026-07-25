import { createFileRoute, Link } from "@tanstack/react-router";
import { ModelTab } from "@/components/tabs/ModelTab";
import { SiteFooter } from "@/components/SiteNav";

export const Route = createFileRoute("/method")({
  head: () => ({
    meta: [
      { title: "Method — wind, solar, cooling and storage physics" },
      {
        name: "description",
        content:
          "The physics behind the siting instrument: Betz-limited wind with shear and air density, temperature-derated PV, Carnot-derived PUE, and Euler battery integration over 8760 hours.",
      },
      { property: "og:title", content: "Method — the physics behind the model" },
      {
        property: "og:description",
        content:
          "Betz-limited wind, temperature-derated solar, Carnot-derived cooling and hourly battery integration across a full meteorological year.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MethodPage,
});

function MethodPage() {
  return (
    <main className="min-h-screen bg-[#07090c]">
      <section className="px-6 pb-16 pt-40 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="label-xs">Method</div>
          <h1 className="mt-4 max-w-3xl text-[clamp(2.2rem,5vw,4rem)] font-extralight leading-[1.02] tracking-[-0.03em]">
            Four equations decide whether a site can power itself.
          </h1>
          <p className="mt-8 max-w-xl text-[15px] font-light leading-relaxed text-foreground/55">
            Every site is simulated hour by hour over a full ERA5 meteorological year. No
            capacity factors, no annual averages — the battery either holds through the
            January calm or it does not.
          </p>
        </div>
      </section>

      <section className="border-t border-hairline px-6 py-20 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <ModelTab />
        </div>
      </section>

      <section className="border-t border-hairline px-6 py-20 md:px-10">
        <div className="mx-auto grid max-w-[1400px] gap-10 md:grid-cols-3">
          <Item
            t="Data source"
            d="Open-Meteo / ERA5 reanalysis, calendar year 2023, 8760 hourly points per site: 100 m wind speed, global irradiance and 2 m temperature."
          />
          <Item
            t="Search space"
            d="A precomputed grid over turbine count, PV capacity and battery energy, evaluated for three IT loads — 10, 25 and 50 MW."
          />
          <Item
            t="Output"
            d="Loss-of-load probability, deficit hours and CAPEX for every combination, plus the cheapest sizing that meets each LOLP threshold."
          />
        </div>
        <div className="mx-auto mt-14 max-w-[1400px]">
          <Link
            to="/instrument"
            className="rounded-full border border-primary/50 bg-primary/10 px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary/20"
          >
            See it applied
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Item({ t, d }: { t: string; d: string }) {
  return (
    <div className="border-t border-hairline pt-5">
      <h3 className="text-lg font-light tracking-tight">{t}</h3>
      <p className="mt-3 text-[13px] font-light leading-relaxed text-foreground/50">{d}</p>
    </div>
  );
}
