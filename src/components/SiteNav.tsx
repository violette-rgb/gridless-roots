import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Index" },
  { to: "/sites", label: "Sites" },
  { to: "/instrument", label: "Instrument" },
  { to: "/guide", label: "Guide" },
  { to: "/method", label: "Method" },
  { to: "/about", label: "About" },
] as const;


export function SiteNav() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="pointer-events-auto mx-auto flex max-w-[1400px] items-center justify-between px-6 py-5 md:px-10">
        <Link to="/" className="group flex items-center gap-3">
          <span className="relative block h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_var(--primary)]" />
          <span className="text-[13px] font-light uppercase tracking-[0.22em]">
            Off<span className="opacity-65">/</span>Grid
          </span>
        </Link>

        <nav className="flex items-center gap-6 md:gap-8">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              className="text-[11px] uppercase tracking-[0.16em] opacity-65 transition-opacity duration-200 hover:opacity-90 data-[status=active]:opacity-100"
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/instrument"
            className="hidden rounded-full border border-primary/40 px-4 py-1.5 text-[11px] uppercase tracking-[0.16em] text-primary transition-colors duration-200 hover:bg-primary/10 sm:inline-block"
          >
            Open instrument
          </Link>
        </nav>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-hairline to-transparent" />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline px-6 py-12 md:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[13px] font-light uppercase tracking-[0.22em]">
            Off<span className="opacity-65">/</span>Grid
          </div>
          <p className="label-xs mt-3 max-w-xs normal-case tracking-normal">
            Siting instrument for grid-independent compute. Open-Meteo / ERA5 reanalysis,
            2023, 8760 hourly points per site.
          </p>
        </div>
        <div className="flex gap-10">
          <FooterCol
            title="Instrument"
            items={[
              { to: "/sites", label: "Site explorer" },
              { to: "/instrument", label: "Sizing instrument" },
              { to: "/guide", label: "How to read it" },
              { to: "/method", label: "Physics model" },
            ]}
          />

          <FooterCol
            title="Project"
            items={[
              { to: "/about", label: "About" },
              { to: "/", label: "Index" },
            ]}
          />
        </div>
      </div>
      <div className="label-xs mx-auto mt-10 max-w-[1400px]">
        © {new Date().getFullYear()} — figures are simulation output, not investment advice.
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  items,
}: {
  title: string;
  items: { to: string; label: string }[];
}) {
  return (
    <div>
      <div className="label-xs">{title}</div>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.label}>
            <Link
              to={i.to}
              className="text-[13px] font-light opacity-60 transition-opacity hover:opacity-100"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
