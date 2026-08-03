import { Logo } from "@/components/Logo";

/**
 * Application footer.
 *
 * Deliberately lean. It carries the one thing the header cannot and every page needs: the standing
 * disclosure about what these numbers are and are not. It does not repeat the navigation or list
 * the data sources, because a duplicate nav is noise and provenance belongs on the methodology
 * page where it can be explained rather than name-dropped.
 *
 * Dark plate so it terminates the light page instead of trailing off into it.
 */
export function Footer() {
  return (
    <footer className="mt-8 bg-ink text-inkmute">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <div className="flex items-start gap-3">
            <Logo size={30} tone="light" />
            <div className="min-w-0">
              <div className="font-display text-[15px] leading-none text-inklight">Alpha-Forge</div>
              <p className="mt-1.5 max-w-[52ch] text-[12px] leading-relaxed">
                Capacity-aware quantitative research. Every strategy is reported with the size it can
                carry, the alpha that survives factor adjustment, and the odds its backtest is an
                artefact.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:items-end">
            <a
              href="https://github.com/AhmedRaoofuddin/Quant"
              className="mono text-[12px] text-inklight transition-colors hover:text-white"
            >
              github.com/AhmedRaoofuddin/Quant
            </a>
            <div className="flex items-center gap-3 mono text-[11px]">
              <span className="text-inkfaint">MIT licence</span>
            </div>
          </div>
        </div>

        <p className="mt-5 border-t border-white/10 pt-4 text-[11.5px] leading-relaxed text-inkfaint">
          Research sandbox. Capacity figures are model estimates from a square-root impact law, not
          execution guarantees, and cross-impact between correlated names is not modelled.
          Survivorship bias lives in the price history itself.{" "}
          <span className="text-inkmute">Nothing here is investment advice.</span>
        </p>
      </div>
    </footer>
  );
}
