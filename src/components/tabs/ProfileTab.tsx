import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Site } from "@/lib/offgrid-data";

export function ProfileTab({ site }: { site: Site }) {
  const w = site.semaine_hiver;
  const data = w.soc_mwh.map((soc, i) => ({
    h: i,
    soc,
    prod: w.prod_mw[i],
    load: w.charge_mw[i],
  }));

  // Contiguous intervals where the battery is empty
  const empties: Array<[number, number]> = [];
  let start: number | null = null;
  w.soc_mwh.forEach((v, i) => {
    if (v <= 0.001 && start === null) start = i;
    if (v > 0.001 && start !== null) {
      empties.push([start, i]);
      start = null;
    }
  });
  if (start !== null) empties.push([start, w.soc_mwh.length - 1]);

  const axis = {
    stroke: "rgba(255,255,255,0.25)",
    fontSize: 10,
    tickLine: false,
    axisLine: false,
  } as const;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-4">
        <Ind label="Mean wind · 100 m" value={`${site.indicateurs.vent_100m_ms} m/s`} />
        <Ind label="Mean irradiance" value={`${site.indicateurs.irradiance_wm2} W/m²`} />
        <Ind label="Mean temperature" value={`${site.indicateurs.temperature_c} °C`} />
        <Ind label="Mean PUE" value={site.indicateurs.pue_moyen.toFixed(3)} />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="label-xs">Battery state of charge · representative winter week</span>
          <span className="label-xs num">
            {w.dimensionnement.turbines} turb · {w.dimensionnement.pv_mw} MWp ·{" "}
            {w.dimensionnement.batt_mwh} MWh · {w.p_it_mw} MW IT
          </span>
        </div>
        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="socFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="h" {...axis} tickFormatter={(v) => `${v}h`} minTickGap={40} />
              <YAxis {...axis} width={44} unit=" MWh" />
              <Tooltip content={<Tip unit="MWh" />} />
              {empties.map(([a, b], i) => (
                <ReferenceArea
                  key={i}
                  x1={a}
                  x2={b}
                  fill="var(--failure)"
                  fillOpacity={0.18}
                  strokeOpacity={0}
                />
              ))}
              <Area
                type="monotone"
                dataKey="soc"
                stroke="var(--primary)"
                strokeWidth={1.5}
                fill="url(#socFill)"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-5">
          <span className="label-xs">Production vs load</span>
          <Legend color="var(--viable)" text="Production" />
          <Legend color="rgba(255,255,255,0.75)" text="Load (IT × PUE)" />
        </div>
        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="prodFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--viable)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--viable)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="h" {...axis} tickFormatter={(v) => `${v}h`} minTickGap={40} />
              <YAxis {...axis} width={44} unit=" MW" />
              <Tooltip content={<Tip unit="MW" />} />
              <Area
                type="monotone"
                dataKey="prod"
                stroke="var(--viable)"
                strokeWidth={1.2}
                fill="url(#prodFill)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="load"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth={1.2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="label-xs flex items-center gap-2">
      <span className="h-px w-4" style={{ background: color }} />
      {text}
    </span>
  );
}

function Ind({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/40 px-4 py-4">
      <div className="label-xs">{label}</div>
      <div className="num mt-1.5 text-lg font-light">{value}</div>
    </div>
  );
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string | number; value?: number; color?: string }>;
  unit: string;
}

function Tip({ active, payload, label, unit }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 text-xs">
      <div className="label-xs">Hour {label}</div>
      {payload.map((p, i) => (
        <div key={i} className="num mt-1" style={{ color: p.color }}>
          {String(p.dataKey)}: {Number(p.value).toFixed(1)} {unit}
        </div>
      ))}
    </div>
  );
}
