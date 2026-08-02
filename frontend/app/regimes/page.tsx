"use client";

import { useEffect, useState } from "react";
import { getLatestRun } from "@/lib/data";
import type { DiscoveryRun } from "@/lib/types";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, Readout } from "@/components/Panel";
import { RegimeEquity } from "@/components/RegimeEquity";
import { RegimeTimeline, TransitionMatrix } from "@/components/RegimeViz";

export default function RegimesPage() {
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    getLatestRun().then((r) => { setRun(r); setState(r ? "ready" : "empty"); }).catch(() => setState("empty"));
  }, []);

  if (state === "loading") return <div className="skeleton h-96 rounded" />;
  if (!run || !run.regimes) return <Panel title="Regimes"><p className="text-xs text-muted">No regime data. Run a discovery first.</p></Panel>;

  const rg = run.regimes;
  const n = rg.states.length;
  const turbulentShare = rg.states.filter((s) => s === 1).length / n;

  // Train vs deploy regime mix, split at the out-of-sample start.
  const oosStart = run.result?.dates[0];
  let trainTurb = 0, trainN = 0, deployTurb = 0, deployN = 0;
  if (oosStart) {
    rg.dates.forEach((d, i) => {
      if (d < oosStart) { trainN++; if (rg.states[i] === 1) trainTurb++; }
      else { deployN++; if (rg.states[i] === 1) deployTurb++; }
    });
  }
  const trainShare = trainN ? trainTurb / trainN : 0;
  const deployShare = deployN ? deployTurb / deployN : 0;
  const mismatch = Math.abs(deployShare - trainShare);
  const mismatchTone = mismatch > 0.2 ? "neg" : mismatch > 0.1 ? "neutral" : "pos";

  return (
    <div className="space-y-2.5">
      <div className="panel flex flex-wrap">
        <Readout label="Current regime" value={rg.labels[rg.currentState].toUpperCase()} tone={rg.currentState === 1 ? "neg" : "pos"} sub="latest state" />
        <Readout label="Turbulent share" value={fmtPercent(turbulentShare, 0)} tone={turbulentShare > 0.4 ? "neg" : "neutral"} sub="of history" />
        <Readout label="Calm vol" value={fmtPercent(rg.vols[0] * Math.sqrt(252), 0)} sub="annualised" />
        <Readout label="Turbulent vol" value={fmtPercent(rg.vols[1] * Math.sqrt(252), 0)} tone="neg" sub="annualised" />
        <Readout label="Calm duration" value={`${fmtNumber(rg.expectedDuration[0], 0)}d`} sub="expected" />
        <Readout label="Turb duration" value={`${fmtNumber(rg.expectedDuration[1], 0)}d`} sub="expected" />
      </div>

      {/* Train vs live mismatch: the headline robustness insight */}
      <Panel title="Train vs live regime shift" accent="red" right="the fragility check">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_1.4fr]">
          <div className="rounded-sm border border-line bg-panel-2 p-3">
            <div className="label mb-1">Train window</div>
            <div className="mono text-2xl font-semibold text-text">{fmtPercent(trainShare, 0)}</div>
            <div className="text-[11px] text-muted">turbulent days in-sample</div>
          </div>
          <div className="rounded-sm border border-line bg-panel-2 p-3">
            <div className="label mb-1">Live window</div>
            <div className={`mono text-2xl font-semibold ${deployShare > trainShare ? "neg" : "pos"}`}>{fmtPercent(deployShare, 0)}</div>
            <div className="text-[11px] text-muted">turbulent days out-of-sample</div>
          </div>
          <div className="rounded-sm border border-line bg-panel-2 p-3">
            <div className="label mb-1">Verdict</div>
            <div className={`mono text-lg font-semibold ${mismatchTone === "neg" ? "neg" : mismatchTone === "pos" ? "pos" : "text-amber"}`}>
              {mismatch > 0.2 ? "REGIME SHIFT" : mismatch > 0.1 ? "MILD DRIFT" : "STABLE"}
            </div>
            <div className="text-[11px] leading-relaxed text-muted">
              The strategy was validated on a market that was {fmtPercent(trainShare, 0)} turbulent but deployed into one
              {" "}{fmtPercent(deployShare, 0)} turbulent (Δ {fmtPercent(mismatch, 0)}). Large shifts invalidate the
              backtest even when the math is clean.
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        <Panel title="Out-of-sample equity by regime" accent="green" className="lg:col-span-2" right="turbulent stretches shaded">
          {run.result ? <RegimeEquity equity={run.result.equity_curve} dates={run.result.dates} regimes={rg} /> : <div className="grid h-40 place-items-center text-xs text-muted">No equity.</div>}
        </Panel>
        <Panel title="Transition matrix" accent="blue">
          <TransitionMatrix regimes={rg} />
        </Panel>
      </div>

      <Panel title="Regime timeline" accent="cyan" right={`${n} trading days, Gaussian HMM (Baum-Welch + Viterbi)`}>
        <RegimeTimeline regimes={rg} />
      </Panel>
    </div>
  );
}
