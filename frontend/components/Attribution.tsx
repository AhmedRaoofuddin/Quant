"use client";

import type { Attribution as Attr, FactorKey } from "@/lib/attribution";
import type { RegimePerformance } from "@/lib/regime-perf";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, SectionHead } from "@/components/Panel";

/**
 * Alpha versus beta, and where a strategy actually earns.
 *
 * The single most useful column here is the t-statistic on alpha. A high headline return with a
 * t below 2 is a strategy that has not demonstrated it earns anything the factors do not already
 * give you, and saying so plainly is the whole point of the panel.
 */

const FACTORS: FactorKey[] = ["MKT", "SMB", "MOM", "VOL", "REV"];

export interface AttributedStrategy {
  id: string;
  name: string;
  family: string;
  grossAnnReturn: number;
  grossSharpe: number;
  caveat: string;
  reference: string;
  attribution: Attr | null;
  regime: RegimePerformance | null;
}

export function Attribution({
  strategies,
  factorPanel,
  regimeModel,
}: {
  strategies: AttributedStrategy[];
  factorPanel: { nObs: number; annReturns: Record<string, number>; missing: string[] };
  regimeModel: { labels: string[]; currentState: number; stationary: number[]; expectedDuration: number[] } | null;
}) {
  const withAttr = strategies.filter((s) => s.attribution);
  const significant = withAttr.filter((s) => Math.abs(s.attribution!.alphaT) >= 2);

  return (
    <div className="space-y-3">
      <SectionHead
        title="Alpha or beta?"
        sub="How much of each strategy's return survives adjusting for factor exposure"
        right={
          <span className={`badge ${significant.length ? "badge-pos" : "badge-warn"}`}>
            {significant.length} / {withAttr.length} WITH t &ge; 2
          </span>
        }
      />

      <Panel title="The uncomfortable result" accent="amber">
        <p className="text-[12.5px] leading-relaxed text-muted">
          {significant.length === 0 ? (
            <>
              Not one strategy in this library produces alpha significant at the conventional
              threshold once market, size, momentum, low-volatility and reversal exposure are
              removed. Several post respectable Sharpe ratios; almost all of that is factor
              exposure an investor can buy far more cheaply elsewhere. That is the normal outcome
              for price-only rules on a large-cap universe, and a library that claimed otherwise
              would be the suspicious one.
            </>
          ) : (
            <>
              <span className="text-text">{significant.length}</span> of {withAttr.length} strategies
              clear a t-statistic of 2 on their intercept after removing market, size, momentum,
              low-volatility and reversal exposure. The rest earn their return from factor exposure
              that can be bought more cheaply elsewhere. Note that the threshold itself is generous
              here: with {withAttr.length} strategies tested on one dataset, a multiple-testing
              adjustment would demand considerably more than 2.
            </>
          )}
        </p>
        <p className="mt-2.5 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-faint">
          Factors are long-short terciles built from this universe over {factorPanel.nObs}{" "}
          observations. Standard errors are Newey-West, because holding the same names between
          rebalances autocorrelates the returns and plain OLS would overstate significance.
          {factorPanel.missing.map((m) => (
            <span key={m} className="block mt-1 text-warn">Not modelled: {m}</span>
          ))}
        </p>
      </Panel>

      <Panel title="Factor attribution" bodyClass="p-0" right="annualised alpha, Newey-West t">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Strategy</th><th>Gross ret</th><th>Alpha</th><th>t(alpha)</th><th>R&sup2;</th>
              {FACTORS.map((f) => <th key={f}>{f}</th>)}
            </tr>
          </thead>
          <tbody>
            {[...withAttr]
              .sort((a, b) => (b.attribution!.alphaT) - (a.attribution!.alphaT))
              .map((s) => {
                const a = s.attribution!;
                const sig = Math.abs(a.alphaT) >= 2;
                return (
                  <tr key={s.id}>
                    <td className="text-left">
                      <span className="font-medium text-text">{s.name}</span>
                      <span className="ml-2 mono text-[10px] uppercase text-faint">{s.family}</span>
                    </td>
                    <td className={`text-right mono ${s.grossAnnReturn >= 0 ? "up" : "down"}`}>
                      {fmtPercent(s.grossAnnReturn, 0)}
                    </td>
                    <td className={`text-right mono font-medium ${a.alphaAnn > 0 ? "up" : "down"}`}>
                      {fmtPercent(a.alphaAnn, 1)}
                    </td>
                    <td className={`text-right mono font-medium ${sig ? "up" : "text-faint"}`}>
                      {fmtNumber(a.alphaT)}
                    </td>
                    <td className="text-right mono text-muted">{fmtPercent(a.rSquared, 0)}</td>
                    {FACTORS.map((f) => {
                      const b = a.betas[f];
                      const strong = Math.abs(b) >= 0.4;
                      return (
                        <td key={f} className={`text-right mono ${strong ? "text-text" : "text-faint"}`}>
                          {fmtNumber(b)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Panel>

      {regimeModel && (
        <>
          <SectionHead
            title="Where it earns"
            sub="The same strategies split by market regime, from a two-state Gaussian HMM on the market proxy"
            right={
              <span className="mono text-[11px] text-muted">
                now: <span className="text-text">{regimeModel.labels[regimeModel.currentState]}</span>
                {" · "}{fmtPercent(regimeModel.stationary[1] ?? 0, 0)} turbulent long-run
              </span>
            }
          />
          <Panel title="Regime-conditional Sharpe" bodyClass="p-0" right="a blended Sharpe hides this">
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>{regimeModel.labels[0]} SR</th><th>obs</th>
                  <th>{regimeModel.labels[1]} SR</th><th>obs</th>
                  <th>Spread</th><th>Favours</th>
                </tr>
              </thead>
              <tbody>
                {strategies
                  .filter((s) => s.regime)
                  .sort((a, b) => b.regime!.regimeSpread - a.regime!.regimeSpread)
                  .map((s) => {
                    const r = s.regime!;
                    const calm = r.slices.find((x) => x.state === 0);
                    const turb = r.slices.find((x) => x.state === 1);
                    return (
                      <tr key={s.id}>
                        <td className="text-left font-medium text-text">{s.name}</td>
                        <td className={`text-right mono ${(calm?.sharpe ?? 0) > 0 ? "up" : "down"}`}>
                          {calm ? fmtNumber(calm.sharpe) : "n/a"}
                        </td>
                        <td className={`text-right mono text-[11px] ${calm?.reliable ? "text-faint" : "text-warn"}`}>
                          {calm?.nObs ?? 0}
                        </td>
                        <td className={`text-right mono ${(turb?.sharpe ?? 0) > 0 ? "up" : "down"}`}>
                          {turb ? fmtNumber(turb.sharpe) : "n/a"}
                        </td>
                        <td className={`text-right mono text-[11px] ${turb?.reliable ? "text-faint" : "text-warn"}`}>
                          {turb?.nObs ?? 0}
                        </td>
                        <td className="text-right mono text-muted">{fmtNumber(r.regimeSpread)}</td>
                        <td className={`text-right mono text-[11px] ${
                          r.favours === "insufficient data" ? "text-warn" : "text-muted"}`}>
                          {r.favours}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Panel>
          <p className="text-[11.5px] leading-relaxed text-faint">
            Observation counts in amber mark buckets too small to draw a conclusion from. The
            turbulent state is rare by construction, so its Sharpe carries far more error than the
            calm one even when both clear the threshold.
          </p>
        </>
      )}
    </div>
  );
}
