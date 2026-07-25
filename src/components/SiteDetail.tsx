import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ViabilityTab } from "@/components/tabs/ViabilityTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { ModelTab } from "@/components/tabs/ModelTab";
import { useHydrated } from "@/lib/hooks";
import type { Dataset, Site } from "@/lib/offgrid-data";

const SiteConcept = lazy(() => import("@/components/tabs/SiteConcept"));

const TABS = ["Viability", "Annual profile", "The model", "Site concept"] as const;

export function SiteDetail({
  site,
  data,
  onClose,
}: {
  site: Site;
  data: Dataset;
  onClose: () => void;
}) {
  const axes = data.grille_axes;
  const [tab, setTab] = useState(0);
  const [pIt, setPIt] = useState(axes.p_it_mw[0]);
  const scenario = useMemo(
    () => site.scenarios.find((s) => s.p_it_mw === pIt) ?? site.scenarios[0],
    [site, pIt],
  );
  const opt = scenario.dimensionnement_optimal["1%"];
  const [turbines, setTurbines] = useState(opt?.turbines ?? axes.turbines[0]);
  const [pv, setPv] = useState(opt?.pv_mw ?? axes.pv_mw[0]);
  const [batt, setBatt] = useState(opt?.batt_mwh ?? axes.batt_mwh[0]);
  const hydrated = useHydrated();

  useEffect(() => {
    const o = scenario.dimensionnement_optimal["1%"];
    if (o) {
      setTurbines(o.turbines);
      setPv(o.pv_mw);
      setBatt(o.batt_mwh);
    }
  }, [scenario]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="panel pointer-events-auto absolute right-4 top-4 bottom-16 z-40 flex w-[min(64vw,900px)] flex-col overflow-hidden max-lg:left-4 max-lg:w-auto"
    >
      <motion.header
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        className="flex items-start justify-between border-b border-hairline px-8 py-6"
      >
        <div>
          <div className="label-xs">
            {site.pays} · {site.latitude.toFixed(2)}°, {site.longitude.toFixed(2)}°
          </div>
          <h2 className="mt-1 text-3xl font-extralight tracking-tight">{site.nom}</h2>
        </div>
        <button
          onClick={onClose}
          className="label-xs rounded-full border border-hairline px-3 py-1.5 transition-colors duration-200 hover:border-primary/40 hover:opacity-90"
        >
          Close
        </button>
      </motion.header>

      <nav className="flex gap-7 border-b border-hairline px-8">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`relative py-4 text-xs uppercase tracking-[0.08em] transition-opacity duration-200 ${
              tab === i ? "opacity-100" : "opacity-40 hover:opacity-70"
            }`}
          >
            {t}
            {tab === i && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-0 -bottom-px h-px bg-primary"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {tab === 0 && (
              <ViabilityTab
                site={site}
                axes={axes}
                scenario={scenario}
                pIt={pIt}
                onPIt={setPIt}
                turbines={turbines}
                pv={pv}
                batt={batt}
                setTurbines={setTurbines}
                setPv={setPv}
                setBatt={setBatt}
              />
            )}
            {tab === 1 && <ProfileTab site={site} />}
            {tab === 2 && <ModelTab />}
            {tab === 3 && (
              <div className="space-y-4">
                <p className="label-xs">
                  {turbines} turbines · {pv} MWp solar · {batt.toLocaleString("en-US")} MWh
                  storage · {pIt} MW IT
                </p>
                {hydrated ? (
                  <Suspense
                    fallback={
                      <div className="label-xs h-[420px] rounded-xl border border-hairline" />
                    }
                  >
                    <SiteConcept turbines={turbines} pv={pv} batt={batt} pIt={pIt} />
                  </Suspense>
                ) : null}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
