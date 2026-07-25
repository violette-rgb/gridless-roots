import { motion } from "framer-motion";
import { useCountUp } from "@/lib/hooks";
import { AxisSlider } from "@/components/AxisSlider";
import {
  classify,
  formatLolp,
  gridIndex,
  VERDICT_COLOR,
  verdictSentence,
  type GrilleAxes,
  type Scenario,
  type Site,
} from "@/lib/offgrid-data";

interface Props {
  site: Site;
  axes: GrilleAxes;
  scenario: Scenario;
  pIt: number;
  onPIt: (v: number) => void;
  turbines: number;
  pv: number;
  batt: number;
  setTurbines: (v: number) => void;
  setPv: (v: number) => void;
  setBatt: (v: number) => void;
}

export function ViabilityTab({
  site,
  axes,
  scenario,
  pIt,
  onPIt,
  turbines,
  pv,
  batt,
  setTurbines,
  setPv,
  setBatt,
}: Props) {
  const idx = gridIndex(
    axes,
    axes.turbines.indexOf(turbines),
    axes.pv_mw.indexOf(pv),
    axes.batt_mwh.indexOf(batt),
  );
  const lolp = scenario.grille.lolp[idx] ?? 0;
  const deficit = scenario.grille.heures_deficit[idx] ?? 0;
  const capex = scenario.grille.capex_meur[idx] ?? 0;

  const animated = useCountUp(lolp * 100);
  const color = VERDICT_COLOR[classify(lolp)];
  const optimum = scenario.dimensionnement_optimal["1%"];

  const display =
    animated === 0 ? "0.00" : animated < 1 ? animated.toFixed(2) : animated.toFixed(1);

  return (
    <div className="space-y-8">
      <div>
        <span className="label-xs">IT load</span>
        <div className="mt-3 flex gap-2">
          {axes.p_it_mw.map((v) => (
            <button
              key={v}
              onClick={() => onPIt(v)}
              className={`num rounded-full border px-4 py-1.5 text-sm font-light transition-all duration-200 ${
                v === pIt
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-hairline text-foreground/45 hover:text-foreground/80"
              }`}
            >
              {v} MW
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-7 md:grid-cols-[1fr_auto]">
        <div className="space-y-7">
          <AxisSlider
            label="Wind turbines · 6 MW"
            value={turbines}
            values={axes.turbines}
            onChange={setTurbines}
          />
          <AxisSlider
            label="Solar"
            value={pv}
            values={axes.pv_mw}
            onChange={setPv}
            unit="MWp"
          />
          <AxisSlider
            label="Battery"
            value={batt}
            values={axes.batt_mwh}
            onChange={setBatt}
            unit="MWh"
          />
        </div>

        <div className="flex flex-col justify-center md:min-w-[280px] md:pl-8">
          <span className="label-xs">Loss of load probability</span>
          <div className="mt-1 flex items-baseline">
            <span
              className="num font-extralight leading-[0.85] transition-colors duration-[400ms]"
              style={{ fontSize: "clamp(80px, 11vw, 140px)", color, fontWeight: 200 }}
            >
              {display}
            </span>
            <span className="ml-2 text-2xl font-extralight opacity-35">%</span>
          </div>
        </div>
      </div>

      <motion.p
        key={verdictSentence(lolp)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="max-w-xl text-base font-light leading-relaxed text-foreground/70"
      >
        {verdictSentence(lolp)}
      </motion.p>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">
        <Stat label="Deficit hours / yr" value={deficit.toLocaleString("en-US")} />
        <Stat label="Autonomy" value={`${((1 - lolp) * 100).toFixed(2)} %`} />
        <Stat label="CAPEX" value={`€${capex.toFixed(0)} M`} />
        <Stat
          label="Best achievable"
          value={`${formatLolp(scenario.meilleur_lolp_atteignable)} %`}
        />
      </div>

      {optimum && (
        <button
          onClick={() => {
            setTurbines(optimum.turbines);
            setPv(optimum.pv_mw);
            setBatt(optimum.batt_mwh);
          }}
          className="w-full rounded-xl border border-hairline px-5 py-4 text-left transition-colors duration-200 hover:border-primary/40"
        >
          <span className="label-xs">Cheapest sizing under 1 % LOLP · {site.nom}</span>
          <div className="num mt-2 text-sm font-light text-foreground/80">
            {optimum.turbines} turbines · {optimum.pv_mw} MWp solar ·{" "}
            {optimum.batt_mwh.toLocaleString("en-US")} MWh battery →{" "}
            <span style={{ color: VERDICT_COLOR[classify(optimum.lolp)] }}>
              {formatLolp(optimum.lolp)} %
            </span>
          </div>
        </button>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Sweep
          title="Sensitivity · battery"
          note={`${turbines} turbines · ${pv} MWp fixed`}
          unit="MWh"
          data={axes.batt_mwh.map((v) => ({
            x: v,
            y:
              (scenario.grille.lolp[
                gridIndex(
                  axes,
                  axes.turbines.indexOf(turbines),
                  axes.pv_mw.indexOf(pv),
                  axes.batt_mwh.indexOf(v),
                )
              ] ?? 0) * 100,
          }))}
          current={batt}
        />
        <Sweep
          title="Sensitivity · turbines"
          note={`${pv} MWp · ${batt.toLocaleString("en-US")} MWh fixed`}
          unit=""
          data={axes.turbines.map((v) => ({
            x: v,
            y:
              (scenario.grille.lolp[
                gridIndex(
                  axes,
                  axes.turbines.indexOf(v),
                  axes.pv_mw.indexOf(pv),
                  axes.batt_mwh.indexOf(batt),
                )
              ] ?? 0) * 100,
          }))}
          current={turbines}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="label-xs">Cost of reliability · cheapest CAPEX per LOLP band</span>
          <span className="label-xs">{pIt} MW IT</span>
        </div>
        <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">
          {frontier(axes, scenario).map((f) => (
            <div key={f.label} className="bg-background/40 px-4 py-4">
              <div className="label-xs" style={{ color: f.color }}>
                {f.label}
              </div>
              <div className="num mt-1.5 text-lg font-light">
                {f.capex === null ? "—" : `€${f.capex.toFixed(0)} M`}
              </div>
              <div className="num mt-1 text-[11px] font-light opacity-40">
                {f.sizing ?? "unreachable"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function frontier(axes: GrilleAxes, scenario: Scenario) {
  const bands = [
    { label: "≤ 0.1 %", max: 0.001, color: VERDICT_COLOR.viable },
    { label: "≤ 1 %", max: 0.01, color: VERDICT_COLOR.viable },
    { label: "≤ 5 %", max: 0.05, color: VERDICT_COLOR.marginal },
    { label: "≤ 10 %", max: 0.1, color: VERDICT_COLOR.marginal },
  ];
  return bands.map((b) => {
    let best: { capex: number; sizing: string } | null = null;
    axes.turbines.forEach((t, it) =>
      axes.pv_mw.forEach((p, ip) =>
        axes.batt_mwh.forEach((bt, ib) => {
          const i = gridIndex(axes, it, ip, ib);
          const l = scenario.grille.lolp[i];
          const c = scenario.grille.capex_meur[i];
          if (l === undefined || c === undefined || l > b.max) return;
          if (!best || c < best.capex)
            best = { capex: c, sizing: `${t} T · ${p} MWp · ${bt.toLocaleString("en-US")} MWh` };
        }),
      ),
    );
    const hit = best as { capex: number; sizing: string } | null;
    return { ...b, capex: hit?.capex ?? null, sizing: hit?.sizing ?? null };
  });
}

function Sweep({
  title,
  note,
  unit,
  data,
  current,
}: {
  title: string;
  note: string;
  unit: string;
  data: { x: number; y: number }[];
  current: number;
}) {
  const max = Math.max(...data.map((d) => d.y), 0.5);
  const w = 100;
  const h = 46;
  const xs = (i: number) => (i / Math.max(1, data.length - 1)) * w;
  const ys = (v: number) => h - (v / max) * h;
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(d.y)}`).join(" ");
  const ci = data.findIndex((d) => d.x === current);

  return (
    <div className="rounded-xl border border-hairline px-5 py-4">
      <div className="flex items-baseline justify-between">
        <span className="label-xs">{title}</span>
        <span className="label-xs opacity-50">{note}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-4 h-24 w-full">
        <path
          d={`${path} L${w},${h} L0,${h} Z`}
          fill="currentColor"
          className="text-primary/10"
        />
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.7}
          vectorEffect="non-scaling-stroke"
          className="text-primary"
        />
        {ci >= 0 && (
          <line
            x1={xs(ci)}
            x2={xs(ci)}
            y1={0}
            y2={h}
            stroke="currentColor"
            strokeWidth={0.5}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
            className="text-foreground/40"
          />
        )}
      </svg>
      <div className="num mt-2 flex justify-between text-[11px] font-light opacity-40">
        <span>
          {data[0].x} {unit}
        </span>
        <span>
          0 – {max.toFixed(max < 2 ? 2 : 0)} % LOLP
        </span>
        <span>
          {data[data.length - 1].x.toLocaleString("en-US")} {unit}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/40 px-4 py-4">
      <div className="label-xs">{label}</div>
      <div className="num mt-1.5 text-lg font-light">{value}</div>
    </div>
  );
}
