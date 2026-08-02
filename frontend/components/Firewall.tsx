import type { ValidationReport } from "@/lib/types";
import { fmtNumber, fmtPercent } from "@/lib/format";

// Overfitting & Leakage Firewall panel: PBO, the CSCV rank-logit distribution (λ<=0 = overfit),
// performance degradation, minimum backtest length, and leakage flags.

const VERDICT = {
  robust: { tone: "green", label: "ROBUST" },
  fragile: { tone: "amber", label: "FRAGILE" },
  overfit: { tone: "red", label: "OVERFIT" },
} as const;

function Histogram({ lambdas }: { lambdas: number[] }) {
  if (lambdas.length < 2) return <div className="grid h-24 place-items-center text-[11px] text-muted">Insufficient splits for CSCV.</div>;
  const bound = Math.max(2.5, ...lambdas.map((l) => Math.abs(l)));
  const bins = 21;
  const counts = new Array(bins).fill(0);
  for (const l of lambdas) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((l + bound) / (2 * bound)) * bins)));
    counts[idx]++;
  }
  const max = Math.max(...counts, 1);
  const W = 320, H = 90, bw = W / bins;
  const zeroX = ((0 + bound) / (2 * bound)) * W;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {/* overfit region (λ < 0) subtle red wash */}
      <rect x={0} y={0} width={zeroX} height={H - 12} className="fill-red" opacity="0.06" />
      {counts.map((c, i) => {
        const h = (c / max) * (H - 16);
        const left = i * bw;
        const overfit = left + bw / 2 < zeroX;
        return <rect key={i} x={left + 1} y={H - 12 - h} width={bw - 2} height={h} className={overfit ? "fill-red" : "fill-green"} opacity="0.85" />;
      })}
      <line x1={zeroX} x2={zeroX} y1={0} y2={H - 12} stroke="rgb(var(--text))" strokeOpacity="0.5" strokeDasharray="2 3" strokeWidth="1" />
      <text x={zeroX} y={H - 2} textAnchor="middle" className="fill-faint mono" fontSize="8">λ = 0</text>
      <text x={4} y={H - 2} className="fill-red mono" fontSize="8">overfit</text>
      <text x={W - 4} y={H - 2} textAnchor="end" className="fill-green mono" fontSize="8">genuine</text>
    </svg>
  );
}

export function Firewall({ v }: { v: ValidationReport }) {
  const verdict = VERDICT[v.verdict];
  const pboTone = v.pbo <= 0.2 ? "pos" : v.pbo <= 0.5 ? "text-amber" : "neg";

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="label">Prob. of backtest overfitting</div>
          <div className={`mono text-[40px] font-semibold leading-none ${pboTone}`}>{fmtPercent(v.pbo, 0)}</div>
        </div>
        <span className={`rounded-sm border px-2 py-1 text-[11px] font-bold tracking-wider ${
          verdict.tone === "green" ? "border-green/50 bg-green/10 text-green" :
          verdict.tone === "amber" ? "border-amber/50 bg-amber/10 text-amber" :
          "border-red/50 bg-red/10 text-red"
        }`}>{verdict.label}</span>
      </div>

      <Histogram lambdas={v.lambdas} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-2 text-[11.5px]">
        <Stat k="CSCV splits" val={`${v.n_combinations} × ${v.n_trials}`} />
        <Stat k="Eff. trials" val={fmtNumber(v.effective_trials, 1)} />
        <Stat k="OOS/IS decay" val={fmtNumber(v.perf_degradation)} tone={v.perf_degradation > 0.5 ? "pos" : v.perf_degradation < 0 ? "neg" : ""} />
        <Stat k="Min backtest" val={v.min_backtest_years >= 99 ? "n/a" : `${fmtNumber(v.min_backtest_years, 1)} yrs`} />
        <Stat k="Haircut Sharpe" val={`${fmtNumber(v.haircut_sharpe)} (−${fmtPercent(v.haircut_pct, 0)})`} tone={v.haircut_pct > 0.5 ? "neg" : ""} />
        <Stat k="Sharpe 95% CI" val={`[${fmtNumber(v.sharpe_ci[0])}, ${fmtNumber(v.sharpe_ci[1])}]`} tone={v.sharpe_ci[0] > 0 ? "pos" : "neg"} />
      </div>

      <div className="border-t border-line pt-2">
        <div className="label mb-1">Leakage scan</div>
        <ul className="space-y-1">
          {v.leakage_flags.map((f, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-muted">
              <span className={f.startsWith("No leakage") ? "text-green" : "text-amber"}>{f.startsWith("No leakage") ? "✓" : "⚠"}</span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ k, val, tone = "", mono }: { k: string; val: string; tone?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{k}</span>
      <span className={`${mono ? "mono" : "mono"} font-medium ${tone || "text-text"}`}>{val}</span>
    </div>
  );
}
