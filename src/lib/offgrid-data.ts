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

/** Headline metric: best achievable LOLP at the most demanding IT load (50 MW). */
export function headlineLolp(site: Site) {
  const heaviest = site.scenarios.reduce((a, b) => (b.p_it_mw > a.p_it_mw ? b : a));
  return heaviest.meilleur_lolp_atteignable;
}

export const CAPEX_TURBINE_MEUR = 8;
export const CAPEX_PV_MEUR_PER_MW = 0.7;
export const CAPEX_BATT_MEUR_PER_MWH = 0.25;

export function sizingCapex(s: { turbines: number; pv_mw: number; batt_mwh: number }) {
  return (
    s.turbines * CAPEX_TURBINE_MEUR +
    s.pv_mw * CAPEX_PV_MEUR_PER_MW +
    s.batt_mwh * CAPEX_BATT_MEUR_PER_MWH
  );
}

/** Cheapest CAPEX (M€) that reaches the band at the heaviest IT load, null if unreachable. */
export function capexForBand(site: Site, band = "1%") {
  const heaviest = site.scenarios.reduce((a, b) => (b.p_it_mw > a.p_it_mw ? b : a));
  const sizing = heaviest.dimensionnement_optimal[band];
  return sizing ? sizingCapex(sizing) : null;
}

export function formatCapex(capex: number | null) {
  return capex === null ? "—" : `€${Math.round(capex).toLocaleString("en-US")} M`;
}


export async function loadDataset(): Promise<Dataset> {
  const res = await fetch("/data.json");
  if (!res.ok) throw new Error("Unable to load dataset");
  return (await res.json()) as Dataset;
}

/** Reference build used to compare sites on equal terms (not the max sizing). */
export const REFERENCE_BUILD = { turbines: 40, pv_mw: 100, batt_mwh: 800 };

function nearestIndex(axis: number[], value: number) {
  let best = 0;
  for (let i = 1; i < axis.length; i++) {
    if (Math.abs(axis[i] - value) < Math.abs(axis[best] - value)) best = i;
  }
  return best;
}

/**
 * LOLP at the reference build (40 turbines · 100 MWp · 800 MWh) under the
 * heaviest simulated IT load. This is the number that actually separates sites,
 * unlike the best-achievable value which saturates at 0 % for many of them.
 */
export function referenceLolp(axes: GrilleAxes, site: Site) {
  const heaviest = site.scenarios.reduce((a, b) => (b.p_it_mw > a.p_it_mw ? b : a));
  const idx = gridIndex(
    axes,
    nearestIndex(axes.turbines, REFERENCE_BUILD.turbines),
    nearestIndex(axes.pv_mw, REFERENCE_BUILD.pv_mw),
    nearestIndex(axes.batt_mwh, REFERENCE_BUILD.batt_mwh),
  );
  return heaviest.grille.lolp[idx];
}

/**
 * Verdict for a site as a whole: can any simulated build hold 1 % outage at the
 * heaviest load (viable), only 5–10 % (marginal), or nothing at all (failure)?
 */
export function siteVerdict(site: Site): Verdict {
  const heaviest = site.scenarios.reduce((a, b) => (b.p_it_mw > a.p_it_mw ? b : a));
  const bands = heaviest.dimensionnement_optimal ?? {};
  if (bands["0.1%"] || bands["1%"]) return "viable";
  if (bands["5%"] || bands["10%"]) return "marginal";
  return "failure";
}
