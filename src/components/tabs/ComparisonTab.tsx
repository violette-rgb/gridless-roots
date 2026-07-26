import { useMemo } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import {
  VERDICT_COLOR,
  siteVerdict,
  formatLolp,
  capexForBand,
  type Dataset,
  type Site,
} from "@/lib/offgrid-data";

export function ComparisonTab({
  data,
  site,
  pIt,
  onPick,
}: {
  data: Dataset;
  site: Site;
  pIt: number;
  onPick: (s: Site) => void;
}) {
  const rows = useMemo(() => {
    return data.sites
      .map((s) => {
        const sc = s.scenarios.find((x) => x.p_it_mw === pIt) ?? s.scenarios[0];
        const capex = capexForBand(s, "1%");
        return {
          site: s,
          lolp: sc.meilleur_lolp_atteignable,
          wind: s.indicateurs.vent_100m_ms,
          capex: capex ?? 0,
          color: VERDICT_COLOR[siteVerdict(s)],
        };
      })
      .sort((a, b) => a.lolp - b.lolp || b.wind - a.wind);
  }, [data.sites, pIt]);

  return (
    <div className="space-y-8">
      <div>
        <div className="label-xs">Best achievable LOLP at {pIt} MW IT · all sites</div>
        <div className="mt-4 h-[240px] w-full">
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="wind"
                name="wind"
                unit=" m/s"
                domain={["dataMin - 0.4", "dataMax + 0.4"]}
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                stroke="rgba(255,255,255,0.15)"
              />
              <YAxis
                type="number"
                dataKey="lolp"
                tickFormatter={(v: number) => `${formatLolp(v)}%`}
                tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
                stroke="rgba(255,255,255,0.15)"
              />
              <ZAxis type="number" dataKey="capex" range={[40, 320]} />
              <Tooltip
                contentStyle={{
                  background: "rgba(7,9,12,0.92)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  fontSize: 11,
                }}
                formatter={(v, k) =>
                  k === "lolp" ? `${formatLolp(Number(v))} %` : `${v}`
                }
                labelFormatter={() => ""}
              />
              <Scatter data={rows} isAnimationActive>
                {rows.map((r) => (
                  <Cell
                    key={r.site.id}
                    fill={r.color}
                    fillOpacity={r.site.id === site.id ? 1 : 0.32}
                    stroke={r.site.id === site.id ? "#fff" : "transparent"}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 max-w-xl text-[13px] font-light leading-relaxed text-foreground/72">
          Mean wind at 100 m on x, best achievable outage on y, point size is the CAPEX needed
          to reach 1 %. The cloud slopes down to the right: wind dominates. Cold alone —
          the low-latitude-of-temperature sites on the left — never gets there.
        </p>
      </div>

      <ul className="overflow-hidden rounded-xl border border-hairline">
        {rows.map((r, i) => (
          <li key={r.site.id}>
            <button
              type="button"
              onClick={() => onPick(r.site)}
              className={`flex w-full items-baseline justify-between gap-4 border-b border-hairline px-4 py-3 text-left transition-opacity duration-300 last:border-b-0 hover:opacity-100 ${
                r.site.id === site.id ? "bg-primary/8 opacity-100" : "opacity-60"
              }`}
            >
              <span className="flex items-baseline gap-3">
                <span className="num text-[11px] opacity-50">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: r.color }}
                />
                <span className="text-[13px] font-light">{r.site.nom}</span>
                <span className="label-xs">{r.site.pays}</span>
              </span>
              <span className="flex items-baseline gap-6">
                <span className="num text-[11px] opacity-55">
                  {r.wind.toFixed(1)} m/s
                </span>
                <span className="num text-[12px]" style={{ color: r.color }}>
                  {formatLolp(r.lolp)}%
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
