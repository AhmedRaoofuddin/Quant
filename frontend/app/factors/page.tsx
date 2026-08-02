"use client";

import { useEffect, useState } from "react";
import { getLatestRun } from "@/lib/data";
import type { DiscoveryRun } from "@/lib/types";
import { fmtNumber } from "@/lib/format";
import { Panel, Readout } from "@/components/Panel";
import { Heatmap } from "@/components/Heatmap";

export default function FactorsPage() {
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    getLatestRun().then((r) => { setRun(r); setState(r ? "ready" : "empty"); }).catch(() => setState("empty"));
  }, []);

  if (state === "loading") return <div className="skeleton h-96 rounded" />;
  if (!run || !run.factor_correlation) return <Panel title="Factors"><p className="text-xs text-muted">No factor data. Run a discovery first.</p></Panel>;

  const fc = run.factor_correlation;
  const N = fc.ids.length;

  // Off-diagonal average absolute correlation and the most-correlated pair.
  let sum = 0, cnt = 0, topPair = { a: "", b: "", c: 0 };
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const c = Math.abs(fc.matrix[i][j]);
    sum += c; cnt++;
    if (c > Math.abs(topPair.c)) topPair = { a: fc.ids[i], b: fc.ids[j], c: fc.matrix[i][j] };
  }
  const avgAbs = cnt ? sum / cnt : 0;
  const eff = run.validation?.effective_trials ?? N;

  return (
    <div className="space-y-2.5">
      <div className="panel flex flex-wrap">
        <Readout label="Factors" value={String(N)} sub="evaluated alphas" />
        <Readout label="Avg |ρ|" value={fmtNumber(avgAbs)} tone={avgAbs > 0.5 ? "neg" : "pos"} sub="pairwise" />
        <Readout label="Eff. breadth" value={fmtNumber(eff, 1)} sub="independent bets" />
        <Readout label="Most correlated" value={fmtNumber(topPair.c)} tone={Math.abs(topPair.c) > 0.7 ? "neg" : "neutral"} sub={`${topPair.a}·${topPair.b}`} />
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        <Panel title="Factor correlation matrix" accent="amber" className="lg:col-span-2" right="pairwise return ρ">
          <Heatmap ids={fc.ids} matrix={fc.matrix} />
        </Panel>

        <Panel title="Redundancy ranking" accent="cyan" right="highest |ρ| pairs">
          <RedundancyList fc={fc} />
        </Panel>
      </div>

      <Panel title="Why this matters" accent="blue">
        <p className="max-w-3xl text-[12.5px] leading-relaxed text-muted">
          Mining many alphas is cheap; finding <span className="text-text">independent</span> ones is not. Two alphas
          with 0.9 correlated returns are one bet, not two, and stacking them inflates apparent breadth while
          concentrating risk. The selector prunes any alpha whose return stream correlates above 0.70 with an already
          accepted one, so the book holds distinct bets. Effective breadth ({fmtNumber(eff, 1)} of {N}) is the count
          used to deflate significance.
        </p>
      </Panel>
    </div>
  );
}

function RedundancyList({ fc }: { fc: { ids: string[]; matrix: number[][] } }) {
  const pairs: { a: string; b: string; c: number }[] = [];
  for (let i = 0; i < fc.ids.length; i++)
    for (let j = i + 1; j < fc.ids.length; j++) pairs.push({ a: fc.ids[i], b: fc.ids[j], c: fc.matrix[i][j] });
  pairs.sort((x, y) => Math.abs(y.c) - Math.abs(x.c));
  return (
    <table className="blotter">
      <thead><tr><th>Pair</th><th>ρ</th></tr></thead>
      <tbody>
        {pairs.slice(0, 10).map((p, i) => (
          <tr key={i} className="grid-row">
            <td className="text-left mono text-[11px] text-muted">{p.a} · {p.b}</td>
            <td className="text-right"><span className={`mono ${Math.abs(p.c) > 0.7 ? "neg" : Math.abs(p.c) < 0.3 ? "pos" : "text-muted"}`}>{p.c >= 0 ? "+" : ""}{p.c.toFixed(2)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
