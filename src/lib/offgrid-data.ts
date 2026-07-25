export interface GrilleAxes {
  turbines: number[];
  pv_mw: number[];
  batt_mwh: number[];
  p_it_mw: number[];
  ordre: string;
}

export interface Indicateurs {
  vent_100m_ms: number;
  irradiance_wm2: number;
  temperature_c: number;
  pue_moyen: number;
}

export interface Sizing {
  turbines: number;
  pv_mw: number;
  batt_mwh: number;
  lolp: number;
}

export interface Scenario {
  p_it_mw: number;
  grille: {
    lolp: number[];
    heures_deficit: number[];
    capex_meur: number[];
  };
  dimensionnement_optimal: Record<string, Sizing>;
  meilleur_lolp_atteignable: number;
}

export interface SemaineHiver {
  p_it_mw: number;
  seuil_lolp: string;
  heure_debut: number;
  dimensionnement: { turbines: number; pv_mw: number; batt_mwh: number };
  soc_mwh: number[];
  prod_mw: number[];
  charge_mw: number[];
}

export interface Site {
  id: string;
  nom: string;
  pays: string;
  latitude: number;
  longitude: number;
  indicateurs: Indicateurs;
  scenarios: Scenario[];
  semaine_hiver: SemaineHiver;
}

export interface Dataset {
  grille_axes: GrilleAxes;
  seuils_lolp_optimisation: string[];
  sites: Site[];
}

export type Verdict = "viable" | "marginal" | "failure";

/** Flattened grid index: i_turb * (n_pv * n_batt) + i_pv * n_batt + i_batt */
export function gridIndex(
  axes: GrilleAxes,
  iTurb: number,
  iPv: number,
  iBatt: number,
) {
  const nPv = axes.pv_mw.length;
  const nBatt = axes.batt_mwh.length;
  return iTurb * (nPv * nBatt) + iPv * nBatt + iBatt;
}

export function classify(lolp: number): Verdict {
  if (lolp <= 0.01) return "viable";
  if (lolp <= 0.1) return "marginal";
  return "failure";
}

export const VERDICT_COLOR: Record<Verdict, string> = {
  viable: "oklch(0.84 0.15 185)",
  marginal: "oklch(0.82 0.15 78)",
  failure: "oklch(0.65 0.21 22)",
};

export const VERDICT_TEXT: Record<Verdict, string> = {
  viable: "text-viable",
  marginal: "text-marginal",
  failure: "text-failure",
};

export function verdictSentence(lolp: number): string {
  if (lolp <= 0.001)
    return "Fully autonomous — suitable for continuous, latency-sensitive services.";
  if (lolp <= 0.01)
    return "Viable for AI training workloads, not for real-time services.";
  if (lolp <= 0.1)
    return "Marginal — interruptible batch compute only, with schedule slack.";
  return "Not viable off-grid at this sizing — the site cannot power itself.";
}

export function formatLolp(lolp: number) {
  const pct = lolp * 100;
  if (pct === 0) return "0.00";
  if (pct < 1) return pct.toFixed(2);
  if (pct < 10) return pct.toFixed(1);
  return pct.toFixed(1);
}

export function bestLolp(site: Site) {
  return Math.min(...site.scenarios.map((s) => s.meilleur_lolp_atteignable));
}

export async function loadDataset(): Promise<Dataset> {
  const res = await fetch("/data.json");
  if (!res.ok) throw new Error("Unable to load dataset");
  return (await res.json()) as Dataset;
}
