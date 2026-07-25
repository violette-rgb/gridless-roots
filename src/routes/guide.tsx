import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteNav";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "How to read this tool — off-grid siting guide" },
      {
        name: "description",
        content:
          "A plain-language guide to the off-grid siting instrument: what LOLP, PUE, CAPEX and the sizing sliders mean, and how to compare the eighteen candidate sites.",
      },
      { property: "og:title", content: "How to read this tool — off-grid siting guide" },
      {
        property: "og:description",
        content:
          "LOLP, PUE, CAPEX, deficit hours and the three IT loads explained — everything needed to read the off-grid datacenter siting instrument.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GuidePage,
});

const TERMS = [
  {
    term: "LOLP",
    unit: "%",
    short: "Loss-of-load probability",
    body: "The share of the 8 760 hours in the year where production plus battery cannot cover the load. 1 % = 88 hours of blackout per year. It is the headline number everywhere in this tool.",
  },
  {
    term: "LOLP · ref build",
    unit: "%",
    short: "The comparison number",
    body: "LOLP at one identical build for every site — 40 turbines, 100 MWp of solar, 800 MWh of storage — under a 50 MW IT load. Because the build is fixed, the ranking measures the weather alone. Push the sliders to the maximum and most sites reach 0 %, which is why the index uses this reference instead.",
  },
  {
    term: "Deficit hours",
    unit: "h / yr",
    short: "The same number, in hours",
    body: "LOLP × 8 760. Easier to reason about for operations: how many hours of the year compute has to stop or fall back to a generator.",
  },
  {
    term: "CAPEX",
    unit: "M€",
    short: "Cost of the build",
    body: "Turbines × €8 M (6 MW each) + solar × €0.7 M per MWp + battery × €0.25 M per MWh. Land, civil works and the halls themselves are excluded.",
  },
  {
    term: "CAPEX ≤ 1 %",
    unit: "M€",
    short: "Cost of reliability",
    body: "The cheapest sizing in the grid that holds LOLP under 1 % at 50 MW. A dash means no sizing we simulate reaches that band — the site is weather-limited, not budget-limited.",
  },
  {
    term: "PUE",
    unit: "ratio",
    short: "Power usage effectiveness",
    body: "Total power drawn per watt of compute. Derived from a Carnot-limited chiller, so cold sites sit near 1.10 (free cooling) and hot sites climb above 1.30 — which is why Seville needs more turbines than Dublin for the same racks.",
  },
];

const STEPS = [
  {
    n: "01",
    t: "Pick a site",
    d: "On Sites, hover a row and the globe swings over its country. On Instrument, the left rail selects it directly. Colour is the verdict: cyan viable, amber marginal, red not viable.",
  },
  {
    n: "02",
    t: "Set the load",
    d: "The IT load buttons (10 / 25 / 50 MW) switch the whole scenario. Everything below — LOLP, deficit hours, optimal sizings — recomputes for that load.",
  },
  {
    n: "03",
    t: "Dial the build",
    d: "Turbines, solar and battery sliders move through the simulated grid. The big number is the LOLP of that exact combination; the CAPEX card is what it costs.",
  },
  {
    n: "04",
    t: "Compare the cost of reliability",
    d: "The frontier row shows the cheapest build for each reliability band. Read it right to left: going from 10 % to 0.1 % is where most of the money goes.",
  },
];

const BANDS = [
  { c: "var(--viable)", l: "≤ 0.1 %", d: "≈ 9 h/yr — approaches continuous, latency-sensitive service." },
  { c: "var(--viable)", l: "≤ 1 %", d: "≈ 88 h/yr — fine for AI training, not for real-time inference SLAs." },
  { c: "var(--marginal)", l: "1 – 10 %", d: "Interruptible batch compute only, with schedule slack." },
  { c: "var(--failure)", l: "> 10 %", d: "The site cannot power itself off-grid at any sizing we simulate." },
];

function GuidePage() {
  return (
    <main className="min-h-screen bg-page">
      <section className="px-6 pb-16 pt-32 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="label-xs">Guide</div>
          <h1 className="mt-4 max-w-3xl text-[clamp(2rem,4.6vw,3.8rem)] font-extralight leading-[1.02] tracking-[-0.03em]">
            How to read this tool.
          </h1>
          <p className="mt-7 max-w-xl text-[15px] font-light leading-relaxed text-foreground/75">
            Every screen answers the same question in a different way: given this weather,
            this build and this compute load, how often does the data center go dark? Here
            is the vocabulary, and the order to read it in.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/instrument"
              className="rounded-full border border-primary/50 bg-primary/10 px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary/20"
            >
              Open the instrument
            </Link>
            <Link
              to="/sites"
              className="rounded-full border border-hairline px-6 py-3 text-[11px] uppercase tracking-[0.16em] opacity-75 transition-opacity hover:opacity-100"
            >
              Explore the globe
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline px-6 py-20 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="label-xs">Four steps</div>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3.2vw,2.4rem)] font-extralight tracking-[-0.02em]">
            The workflow, start to finish.
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-hairline pt-5">
                <div className="num label-xs text-primary">{s.n}</div>
                <h3 className="mt-4 text-lg font-light tracking-tight">{s.t}</h3>
                <p className="mt-3 text-[13px] font-light leading-relaxed text-foreground/72">
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline px-6 py-20 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="label-xs">Vocabulary</div>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3.2vw,2.4rem)] font-extralight tracking-[-0.02em]">
            Six terms, and nothing else to learn.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline md:grid-cols-2 lg:grid-cols-3">
            {TERMS.map((t) => (
              <div key={t.term} className="bg-background/50 px-6 py-7">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="num text-base font-light text-primary">{t.term}</span>
                  <span className="label-xs">{t.unit}</span>
                </div>
                <div className="mt-1 text-[13px] font-light">{t.short}</div>
                <p className="mt-3 text-[13px] font-light leading-relaxed text-foreground/72">
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-hairline px-6 py-20 md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <div className="label-xs">Verdict bands</div>
          <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3.2vw,2.4rem)] font-extralight tracking-[-0.02em]">
            What the colours mean.
          </h2>
          <ul className="mt-12 divide-y divide-hairline border-y border-hairline">
            {BANDS.map((b) => (
              <li key={b.l} className="flex flex-col gap-2 py-5 sm:flex-row sm:items-baseline sm:gap-8">
                <span className="flex w-32 shrink-0 items-baseline gap-3">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: b.c, boxShadow: `0 0 12px ${b.c}` }}
                  />
                  <span className="num text-lg font-extralight" style={{ color: b.c }}>
                    {b.l}
                  </span>
                </span>
                <span className="text-[13px] font-light leading-relaxed text-foreground/75">
                  {b.d}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-xl text-[13px] font-light leading-relaxed text-foreground/72">
            Several sites reach 0.00 % at their largest sizing — that is a real result, not a
            missing value. It means wind and storage alone cover every hour of 2023 at that
            build; the interesting question there becomes CAPEX, not reliability.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
