import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ViabilityTab } from "@/components/tabs/ViabilityTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { ModelTab } from "@/components/tabs/ModelTab";
import { ComparisonTab } from "@/components/tabs/ComparisonTab";
import { ContextTab } from "@/components/tabs/ContextTab";
import type { Dataset, Site } from "@/lib/offgrid-data";
import type { BuildSpec } from "@/lib/site-model";

const TABS = ["Viability", "Annual profile", "Comparison", "The model", "Context"] as const;

export function SiteDetail({
  site,
  data,
  onClose,
  embedded = false,
  onBuild,
  onPickSite,
}: {
  site: Site;
  data: Dataset;
  onClose?: () => void;
  embedded?: boolean;
  onBuild?: (b: BuildSpec) => void;
  onPickSite?: (s: Site) => void;
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

  useEffect(() => {
    const o = scenario.dimensionnement_optimal["1%"];
    if (o) {
      setTurbines(o.turbines);
      setPv(o.pv_mw);
      setBatt(o.batt_mwh);
    }
  }, [scenario]);

  // The map rebuilds its site model from these numbers.
  useEffect(() => {
    onBuild?.({ turbines, pv_mw: pv, batt_mwh: batt });
  }, [turbines, pv, batt, onBuild]);

  useEffect(() => {
    if (!onClose) return;
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
      className={`panel pointer-events-auto z-40 flex flex-col overflow-hidden ${
        embedded
          ? "relative h-[calc(100vh-8rem)] w-full"
          : "absolute right-4 top-24 bottom-6 w-[min(38vw,470px)] max-lg:left-4 max-lg:w-auto"
      }`}
    >
      <header className="flex items-start justify-between border-b border-hairline px-6 py-5">
        <div>
          <div className="label-xs">
            {site.pays} · {site.latitude.toFixed(2)}°, {site.longitude.toFixed(2)}°
          </div>
          <h2 className="mt-1 text-2xl font-extralight tracking-tight">{site.nom}</h2>
        </div>
        {!embedded && (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/instrument"
              className="label-xs rounded-full border border-primary/40 px-3 py-1.5 text-primary transition-colors duration-200 hover:bg-primary/10"
            >
              Full page
            </Link>
            {onClose && (
              <button
                onClick={onClose}
                className="label-xs rounded-full border border-hairline px-3 py-1.5 transition-colors duration-200 hover:border-primary/40 hover:opacity-90"
              >
                Close
              </button>
            )}
          </div>
        )}
      </header>

      <nav className="flex gap-5 overflow-x-auto border-b border-hairline px-6">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`relative whitespace-nowrap py-3.5 text-[11px] uppercase tracking-[0.08em] transition-opacity duration-200 ${
              tab === i ? "opacity-100" : "opacity-60 hover:opacity-80"
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

      <div className="flex-1 overflow-y-auto px-6 py-6">

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
            {tab === 2 && (
              <ComparisonTab
                data={data}
                site={site}
                pIt={pIt}
                onPick={(s) => onPickSite?.(s)}
              />
            )}
            {tab === 3 && <ModelTab />}
            {tab === 4 && <ContextTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
