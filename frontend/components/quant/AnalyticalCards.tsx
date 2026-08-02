"use client";

import type { AssetStats } from "@/lib/quant-types";
import { sectorColor, sectorInk } from "@/lib/sectors";

// The "analytical dashboard" strip from the reference: small cards, each a mini line chart with a
// big headline number. Here they surface the leaders in the current screen.

function Line({ series, color }: { series: number[]; color: string }) {
  const d = series.slice(-60);
  if (d.length < 2) return null;
  const lo = Math.min(...d), hi = Math.max(...d), span = hi - lo || 1, W = 200, H = 46;
  const path = d.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (d.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / span) * H).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none">
      <defs><linearGradient id={`acg-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={`url(#acg-${color})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export function AnalyticalCards({ assets }: { assets: AssetStats[] }) {
  const top = [...assets].sort((a, b) => b.sharpe - a.sharpe).slice(0, 4);
  if (!top.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {top.map((a) => {
        const color = sectorColor(a.sector);   // stroke
        const ink = sectorInk(a.sector);       // label
        return (
          <div key={a.symbol} className="panel px-3 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="mono text-[12px] font-semibold text-text">{a.symbol}</span>
              <span className="label" style={{ color: ink }}>{a.sector}</span>
            </div>
            <Line series={a.series} color={color} />
            <div className="mt-1.5 flex items-end justify-between">
              <span className={`mono text-[20px] font-semibold leading-none ${a.totalReturn >= 0 ? "pos" : "neg"}`}>{a.totalReturn >= 0 ? "+" : ""}{(a.totalReturn * 100).toFixed(0)}%</span>
              <span className="mono text-[10px] text-faint">Sharpe {a.sharpe.toFixed(2)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
