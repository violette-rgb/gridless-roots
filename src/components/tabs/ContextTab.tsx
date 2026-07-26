export function ContextTab() {
  return (
    <div className="max-w-[60ch] space-y-6 text-[14px] font-light leading-[1.85] text-foreground/80">
      <p className="label-xs">Context · why off-grid, why now</p>
      <p>
        The binding constraint on new compute in Europe is no longer silicon or capital. It is
        an interconnection queue. In the largest markets a request for a hundred megawatts of
        firm grid capacity is answered with a date, and the date is late in the decade.
      </p>
      <p>
        An off-grid campus sidesteps the queue by generating its own power on site. The
        question this instrument answers is narrow and physical: with turbines, panels and
        batteries built on one piece of ground, how many hours a year does the load go unmet?
        That number is the loss-of-load probability, and it is the only figure that decides
        whether a site is a data centre or a pilot project.
      </p>
      <p>
        Europe's advantage is its Atlantic and Nordic wind. The northern coastlines run high
        mean wind speeds through exactly the months when solar collapses, and cold air lowers
        the cooling penalty so more of the generated energy reaches the racks. The map's
        ranking follows from that: wind resource dominates, storage buys hours not weeks, and
        latitude alone buys nothing.
      </p>
      <p>
        Everything shown is computed from a single year of reanalysis weather at hourly
        resolution, simulated step by step. No capacity factors are assumed, no averages are
        smoothed. When a site fails, you can see the week in which it failed.
      </p>
    </div>
  );
}
