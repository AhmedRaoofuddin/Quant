"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getRun } from "@/lib/data";
import type { DiscoveryRun } from "@/lib/types";
import { fmtNumber, fmtPercent, toneForSharpe } from "@/lib/format";
import { Panel, Readout } from "@/components/Panel";
import { EquityCurve } from "@/components/EquityCurve";
import { AllocationChart } from "@/components/AllocationChart";
import { AlphaLeaderboard } from "@/components/AlphaLeaderboard";

export default function RunDetail() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!id) return;
    getRun(id).then((r) => { setRun(r); setState("ready"); }).catch(() => setState("error"));
  }, [id]);

  if (state === "loading") return <div className="skeleton h-96 rounded" />;
  if (state === "error" || !run)
    return (
      <Panel title="Run" accent="amber">
        <p className="text-xs text-red">Run not found. <Link href="/runs" className="text-blue">← back</Link></p>
      </Panel>
    );

  const m = run.result?.metrics;
  const t = (x: number): "pos" | "neg" | "neutral" => (x > 0 ? "pos" : x < 0 ? "neg" : "neutral");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/runs" className="mono text-[11px] text-blue hover:underline">← runs</Link>
        <span className="mono text-[13px] text-text">{run.run_id}</span>
      </div>

      <div className="panel flex flex-wrap">
        <Readout label="OOS Sharpe" value={m ? fmtNumber(m.sharpe) : "—"} tone={m ? (toneForSharpe(m.sharpe) === "positive" ? "pos" : "neg") : "neutral"} />
        <Readout label="Ann Return" value={m ? fmtPercent(m.ann_return) : "—"} tone={m ? t(m.ann_return) : "neutral"} />
        <Readout label="Max DD" value={m ? fmtPercent(m.max_drawdown) : "—"} tone="neg" />
        <Readout label="Selected" value={`${run.n_selected}/${run.n_proposed}`} />
        <Readout label="Region" value={run.region} />
      </div>

      {run.result && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel title="Out-of-sample equity" accent="green" className="lg:col-span-2">
            <EquityCurve equity={run.result.equity_curve} dates={run.result.dates} />
          </Panel>
          <Panel title="Allocation" accent="cyan">
            <AllocationChart allocation={run.result.allocation} />
          </Panel>
        </div>
      )}

      <Panel title="Alpha monitor" accent="green" bodyClass="p-0" right={`${run.alphas.length} evaluated`}>
        <AlphaLeaderboard alphas={run.alphas} />
      </Panel>
    </div>
  );
}
