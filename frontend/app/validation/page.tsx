"use client";

import { useEffect, useState } from "react";
import { getLatestRun } from "@/lib/data";
import type { DiscoveryRun } from "@/lib/types";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, Readout } from "@/components/Panel";
import { Firewall } from "@/components/Firewall";

export default function ValidationPage() {
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    getLatestRun().then((r) => { setRun(r); setState(r ? "ready" : "empty"); }).catch(() => setState("empty"));
  }, []);

  if (state === "loading") return <div className="skeleton h-96 rounded" />;
  if (!run || !run.validation) return <Panel title="Firewall"><p className="text-xs text-muted">No validation data. Run a discovery first.</p></Panel>;

  const v = run.validation;
  const perAlpha = new Map(v.per_alpha.map((p) => [p.alpha_id, p]));

  return (
    <div className="space-y-2.5">
      <div className="panel flex flex-wrap">
        <Readout label="PBO" value={fmtPercent(v.pbo, 0)} tone={v.pbo <= 0.2 ? "pos" : v.pbo <= 0.5 ? "neutral" : "neg"} sub="overfit prob" />
        <Readout label="Verdict" value={v.verdict.toUpperCase()} tone={v.verdict === "robust" ? "pos" : v.verdict === "overfit" ? "neg" : "neutral"} sub="firewall" />
        <Readout label="Haircut" value={fmtNumber(v.haircut_sharpe)} tone={v.haircut_pct > 0.5 ? "neg" : "pos"} sub={`−${fmtPercent(v.haircut_pct, 0)} Sharpe`} />
        <Readout label="Sharpe CI" value={`[${fmtNumber(v.sharpe_ci[0])},${fmtNumber(v.sharpe_ci[1])}]`} tone={v.sharpe_ci[0] > 0 ? "pos" : "neg"} sub="95% bootstrap" />
        <Readout label="Eff. trials" value={fmtNumber(v.effective_trials, 1)} sub={`of ${v.n_trials}`} />
        <Readout label="Min backtest" value={v.min_backtest_years >= 99 ? "n/a" : `${fmtNumber(v.min_backtest_years, 1)}y`} sub="PSR 0.95" />
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        <Panel title="CSCV overfitting test" accent="red" className="lg:col-span-1" right={`${v.n_combinations} splits`}>
          <Firewall v={v} />
        </Panel>

        <Panel title="Per-alpha significance" accent="amber" className="lg:col-span-2" bodyClass="p-0" right="PSR · Deflated Sharpe · IS/OOS">
          <div className="max-h-[440px] overflow-auto">
            <table className="blotter">
              <thead>
                <tr><th>Alpha</th><th>IS Shrp</th><th>OOS Shrp</th><th>PSR</th><th>DSR</th><th>Verdict</th></tr>
              </thead>
              <tbody>
                {[...run.alphas].sort((a, b) => (perAlpha.get(b.expression.id)?.psr ?? 0) - (perAlpha.get(a.expression.id)?.psr ?? 0)).map((a) => {
                  const pa = perAlpha.get(a.expression.id);
                  const psr = pa?.psr ?? 0;
                  const oos = a.out_sample?.sharpe ?? 0;
                  const sig = psr > 0.95 && (pa?.dsr ?? 0) > 0.9;
                  return (
                    <tr key={a.expression.id} className="grid-row">
                      <td className="text-left mono text-[11px] text-text" title={a.expression.rationale}>{a.expression.expression}</td>
                      <td className="text-right"><span className={`mono ${a.in_sample.sharpe > 0 ? "pos" : "neg"}`}>{fmtNumber(a.in_sample.sharpe)}</span></td>
                      <td className="text-right"><span className={`mono ${oos > 0 ? "pos" : "neg"}`}>{fmtNumber(oos)}</span></td>
                      <td className="text-right"><span className={`mono ${psr > 0.9 ? "pos" : psr < 0.5 ? "neg" : "text-muted"}`}>{fmtPercent(psr, 0)}</span></td>
                      <td className="text-right mono text-muted">{fmtNumber(pa?.dsr ?? 0)}</td>
                      <td className="text-right"><span className={`mono text-[10px] ${sig ? "pos" : "text-faint"}`}>{sig ? "PASS" : "—"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="How the verdict is reached" accent="blue">
        <div className="grid gap-4 text-[12px] leading-relaxed text-muted md:grid-cols-3">
          <div>
            <div className="mb-1 font-semibold text-text">1. CSCV → PBO</div>
            The {v.n_trials} alphas are stress-tested across {v.n_combinations} combinatorial train/test splits. PBO is
            the share of splits where the best in-sample alpha lands below the out-of-sample median. Here {fmtPercent(v.pbo, 0)}.
          </div>
          <div>
            <div className="mb-1 font-semibold text-text">2. Deflate the Sharpe</div>
            The best alpha&apos;s Sharpe is adjusted for {v.n_trials} trials (Deflated Sharpe) and for multiple testing
            (Holm haircut, −{fmtPercent(v.haircut_pct, 0)}). A block bootstrap gives the 95% CI.
          </div>
          <div>
            <div className="mb-1 font-semibold text-text">3. Verdict</div>
            PBO ≤ 20% reads <span className="text-green">robust</span>, ≤ 50% <span className="text-amber">fragile</span>,
            else <span className="text-red">overfit</span>. Effective breadth ({fmtNumber(v.effective_trials, 1)}) and the
            leakage scan qualify the call.
          </div>
        </div>
      </Panel>
    </div>
  );
}
