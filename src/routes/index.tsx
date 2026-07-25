import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { SiteFooter } from "@/components/SiteNav";
import { HeroGlobe } from "@/components/HeroGlobe";
import {
  bestLolp,
  classify,
  formatLolp,
  loadDataset,
  VERDICT_COLOR,
} from "@/lib/offgrid-data";
import { useHydrated } from "@/lib/hooks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Off-grid datacenter siting — Europe" },
      {
        name: "description",
        content:
          "Grid connection takes seven to ten years. This instrument asks where a data center can skip it entirely — wind, solar, storage, and the loss-of-load probability that follows.",
      },
      { property: "og:title", content: "Off-grid datacenter siting — Europe" },
      {
        property: "og:description",
        content:
          "Eight European sites, 8760 hourly points each, one number: LOLP. A decision-support instrument for grid-independent compute.",
      },
    ],
  }),
  component: Landing,
});

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

function Landing() {
  const hydrated = useHydrated();
  const { data } = useQuery({
    queryKey: ["offgrid-dataset"],
    queryFn: loadDataset,
    staleTime: Infinity,
    enabled: hydrated,
  });

  return (
    <main className="min-h-screen bg-[#07090c]">
      {/* Hero */}
      <section className="relative flex min-h-screen items-center overflow-hidden px-6 md:px-10">
        {hydrated && <HeroGlobe />}
        <div className="vignette pointer-events-none absolute inset-0" />

        <motion.div
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.08, delayChildren: 0.15 }}
          className="relative mx-auto w-full max-w-[1400px]"
        >
          <motion.p variants={fade} className="label-xs">
            Europe · grid-independent compute
          </motion.p>
          <motion.h1
            variants={fade}
            className="mt-6 max-w-4xl text-[clamp(2.6rem,7vw,5.6rem)] font-extralight leading-[0.95] tracking-[-0.03em]"
          >
            Build the datacenter
            <br />
            <span className="text-primary">before the grid arrives.</span>
          </motion.h1>
          <motion.p
            variants={fade}
            className="mt-8 max-w-lg text-[15px] font-light leading-relaxed text-foreground/55"
          >
            A grid connection in Europe takes seven to ten years. We simulate eight
            candidate sites hour by hour across a full meteorological year and answer one
            question: can wind, solar and storage alone hold the load?
          </motion.p>

          <motion.div variants={fade} className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/sites"
              className="rounded-full border border-primary/50 bg-primary/10 px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-primary transition-colors duration-200 hover:bg-primary/20"
            >
              Explore the globe
            </Link>
            <Link
              to="/method"
              className="rounded-full border border-hairline px-6 py-3 text-[11px] uppercase tracking-[0.16em] opacity-60 transition-opacity duration-200 hover:opacity-100"
            >
              Read the method
            </Link>
          </motion.div>

          <motion.dl
            variants={fade}
            className="mt-20 grid max-w-3xl grid-cols-2 gap-8 border-t border-hairline pt-8 md:grid-cols-4"
          >
            <Stat k="8" label="candidate sites" />
            <Stat k="8 760" label="hourly points / site" />
            <Stat k="3" label="IT loads simulated" />
            <Stat k="1 %" label="viability threshold" />
          </motion.dl>
        </motion.div>
      </section>

      {/* Thesis */}
      <Section
        eyebrow="The premise"
        title="Loss-of-load probability is the only honest metric."
      >
        <div className="grid gap-10 md:grid-cols-3">
          <Card
            n="01"
            t="Interconnection is the bottleneck"
            d="Compute demand moves in eighteen-month cycles. Transmission moves in decades. Off-grid siting decouples the two."
          />
          <Card
            n="02"
            t="Weather decides, not nameplate"
            d="A 300 MWp array in Seville and one in Kiruna are different machines. Only hourly reanalysis exposes the difference."
          />
          <Card
            n="03"
            t="One number, three verdicts"
            d="LOLP under 1 % supports AI training. Under 0.1 % approaches continuous service. Above 10 % the site cannot power itself."
          />
        </div>
      </Section>

      {/* Sites preview */}
      <Section eyebrow="The sites" title="Eight locations, ranked by best achievable LOLP.">
        <ul className="divide-y divide-hairline border-y border-hairline">
          {data?.sites
            .slice()
            .sort((a, b) => bestLolp(a) - bestLolp(b))
            .map((s) => {
              const lolp = bestLolp(s);
              const color = VERDICT_COLOR[classify(lolp)];
              return (
                <li key={s.id}>
                  <Link
                    to="/sites"
                    className="group flex items-baseline justify-between py-5 transition-opacity duration-200 hover:opacity-100 md:py-6"
                  >
                    <span className="flex items-baseline gap-4">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: color, boxShadow: `0 0 12px ${color}` }}
                      />
                      <span className="text-xl font-extralight tracking-tight md:text-2xl">
                        {s.nom}
                      </span>
                      <span className="label-xs">{s.pays}</span>
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span
                        className="num text-xl font-extralight md:text-2xl"
                        style={{ color }}
                      >
                        {formatLolp(lolp)}
                      </span>
                      <span className="label-xs">% LOLP</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          {!data && <li className="label-xs py-6">Loading site index…</li>}
        </ul>
      </Section>

      {/* CTA */}
      <section className="px-6 pb-24 md:px-10">
        <div className="panel mx-auto flex max-w-[1400px] flex-col items-start justify-between gap-6 px-8 py-12 md:flex-row md:items-center">
          <div>
            <h3 className="text-2xl font-extralight tracking-tight md:text-3xl">
              Open the instrument.
            </h3>
            <p className="mt-2 max-w-md text-[13px] font-light text-foreground/50">
              Rotate the globe, hover a site, dial turbines, solar and storage — and watch
              the loss-of-load probability move in real time.
            </p>
          </div>
          <Link
            to="/sites"
            className="rounded-full border border-primary/50 bg-primary/10 px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary/20"
          >
            Launch site explorer
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Stat({ k, label }: { k: string; label: string }) {
  return (
    <div>
      <dt className="num text-3xl font-extralight tracking-tight">{k}</dt>
      <dd className="label-xs mt-1.5">{label}</dd>
    </div>
  );
}

export function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-hairline px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1400px]">
        <div className="label-xs">{eyebrow}</div>
        <h2 className="mt-4 max-w-2xl text-[clamp(1.6rem,3.4vw,2.6rem)] font-extralight leading-tight tracking-[-0.02em]">
          {title}
        </h2>
        <div className="mt-14">{children}</div>
      </div>
    </section>
  );
}

function Card({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="border-t border-hairline pt-5">
      <div className="num label-xs text-primary opacity-100">{n}</div>
      <h3 className="mt-4 text-lg font-light tracking-tight">{t}</h3>
      <p className="mt-3 text-[13px] font-light leading-relaxed text-foreground/50">{d}</p>
    </div>
  );
}
