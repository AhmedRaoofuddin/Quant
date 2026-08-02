"use client";

import { useState } from "react";
import type { AssetStats } from "@/lib/quant-types";
import { sectorColor, sectorInk } from "@/lib/sectors";

// Market return heatmap: rows are assets (grouped by sector), columns are recent periods, each
// cell coloured by that period's return. The real-data analog of a market pulse grid.

const N = 26;

// Light theme: near-white at flat, green for gains, clay red for losses.
function color(r: number): string {
  const cap = 0.06, a = Math.min(1, Math.abs(r) / cap);
  const base = [245, 248, 250], hue = r >= 0 ? [61, 131, 97] : [176, 65, 58];
  const m = base.map((b, i) => Math.round(b * (1 - a) + hue[i] * a));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

export function MarketHeatmap({ assets }: { assets: AssetStats[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const rows = [...assets].sort((a, b) => a.sector.localeCompare(b.sector) || b.sharpe - a.sharpe);
  if (!rows.length) return <div className="grid h-40 place-items-center text-xs text-muted">no data</div>;
  const sample = rows[0].series.slice(-N);
  const startDate = rows[0].dates.slice(-N)[0] ?? "";
  const endDate = rows[0].dates[rows[0].dates.length - 1] ?? "";

  return (
    <div className="space-y-2">
      <div className="max-h-[360px] overflow-auto">
        {rows.map((a) => {
          const s = a.series.slice(-N);
          const rets: number[] = [];
          for (let i = 1; i < s.length; i++) rets.push(s[i] / s[i - 1] - 1);
          return (
            <div key={a.symbol} className="flex items-center gap-1.5 py-[1px]" onMouseEnter={() => setHover(a.symbol)}>
              <span className="w-11 shrink-0 mono text-[9.5px]" style={{ color: sectorInk(a.sector) }}>{a.symbol}</span>
              <div className="flex flex-1 gap-[1px]">
                {rets.map((r, i) => <div key={i} className="h-[9px] flex-1 rounded-[1px]" style={{ backgroundColor: color(r) }} title={`${a.symbol} ${(r * 100).toFixed(1)}%`} />)}
              </div>
              <span className={`w-11 shrink-0 text-right mono text-[9.5px] ${a.totalReturn >= 0 ? "pos" : "neg"}`}>{(a.totalReturn * 100).toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[9.5px] text-faint">
        <span className="mono">{startDate}</span>
        <span className="flex items-center gap-2">
          <span>loss</span>
          <span className="h-2 w-24 rounded-sm" style={{ background: "linear-gradient(90deg, rgb(176,65,58), rgb(245,248,250), rgb(61,131,97))" }} />
          <span>gain</span>
        </span>
        <span className="mono">{endDate}</span>
      </div>
      <p className="text-[10px] text-faint">{hover ? `${hover} row highlighted` : `${rows.length} names · ${N - 1} periods · ~weekly returns`}</p>
    </div>
  );
}
