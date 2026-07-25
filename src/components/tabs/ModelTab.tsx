import katex from "katex";
import "katex/dist/katex.min.css";

function Eq({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: true,
  });
  return (
    <div
      className="overflow-x-auto py-1 text-foreground/90"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Block({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-hairline pt-8">
      <div className="flex items-baseline gap-3">
        <span className="num label-xs">{n}</span>
        <h3 className="text-lg font-light tracking-tight">{title}</h3>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-2xl font-serif text-[15px] leading-[1.85] text-foreground/65">
      {children}
    </p>
  );
}

export function ModelTab() {
  return (
    <div className="space-y-10 pb-4">
      <P>
        Every number in this tool comes from one deterministic simulation: 8 760 hourly
        points of ERA5 reanalysis per site, converted into power, integrated through a
        battery, and reduced to a single probability. No stochastics, no fitted models.
      </P>

      <Block n="01" title="Wind">
        <P>
          Ten-metre reanalysis wind is extrapolated to the 100 m hub with a power-law
          boundary layer, exponent 0.14 for open terrain.
        </P>
        <Eq tex="v(z_{hub}) = v_{10}\left(\frac{z_{hub}}{z_{ref}}\right)^{\alpha},\quad \alpha = 0.14" />
        <P>
          Air density follows the ideal gas law, so cold sites extract more power from the
          same wind speed.
        </P>
        <Eq tex="\rho = \frac{p_{atm}}{R_{air}\,T},\quad p_{atm}=101\,325\ \text{Pa},\ R_{air}=287" />
        <P>
          Rotor power is the kinetic flux through a 150 m disc with a real power
          coefficient of 0.45 — below the Betz limit of 0.593 — clipped at the 6 MW rating
          and zeroed outside cut-in 3 m/s and cut-out 25 m/s.
        </P>
        <Eq tex="P_{wind} = \min\!\left(\tfrac{1}{2}\rho A v^{3} C_p,\ P_{nom}\right),\quad C_p = 0.45" />
      </Block>

      <Block n="02" title="Solar">
        <P>
          Global horizontal irradiance scales linearly against 1 000 W/m², derated by cell
          temperature: the module runs 0.03 K hotter per W/m² of irradiance and loses
          0.4 % of its yield per kelvin above 25 °C.
        </P>
        <Eq tex="P_{pv} = \frac{G}{1000}\,P_{c}\left[1-\gamma\,(T_{cell}-25)\right],\quad T_{cell}=T+0.03\,G" />
      </Block>

      <Block n="03" title="Cooling and PUE">
        <P>
          All IT power becomes heat. The chiller is modelled as a Carnot machine with 50 %
          isentropic efficiency, evaporating at 15 °C and condensing 10 K above ambient —
          so the PUE is a function of local temperature, not a constant.
        </P>
        <Eq tex="COP = \eta\,\frac{T_{evap}}{T_{cond}-T_{evap}},\qquad PUE = 1 + \frac{1}{COP}" />
        <P>
          Below 15 °C ambient the site switches to free cooling and the PUE is fixed at
          1.10. This is why the Nordic sites carry a structural advantage.
        </P>
        <Eq tex="P_{load} = P_{IT}\cdot PUE(T)" />
      </Block>

      <Block n="04" title="Battery">
        <P>
          The power balance is integrated with explicit Euler over 8 760 one-hour steps,
          starting at half charge, with a 90 % round-trip efficiency and hard bounds at
          zero and rated capacity. Surplus beyond full charge is curtailed.
        </P>
        <Eq tex="E_{t+1} = \operatorname{clip}\big(E_t + (P_{prod,t}-P_{load,t})\,\Delta t\,\eta,\ 0,\ C\big),\quad \Delta t = 1\ \text{h}" />
      </Block>

      <Block n="05" title="Loss of load probability">
        <P>
          An hour counts as a deficit whenever demand exceeds production plus the energy
          the battery can actually deliver. LOLP is simply the share of such hours in the
          year — the one number the whole product turns on.
        </P>
        <Eq tex="LOLP = \frac{\#\{t\ :\ \text{deficit}\}}{8760}" />
      </Block>

      <Block n="06" title="Sizing search">
        <P>
          For each site and IT load the grid is swept exhaustively, and the cheapest
          configuration meeting the LOLP threshold is retained, at €8 M per 6 MW turbine,
          €0.7 M per MWp of solar and €0.25 M per MWh of storage.
        </P>
        <Eq tex="\min\ \big(8\,n_{turb} + 0.7\,P_{pv} + 0.25\,E_{batt}\big)\ \text{M€}\quad \text{s.t.}\ LOLP \le LOLP_{max}" />
      </Block>
    </div>
  );
}
