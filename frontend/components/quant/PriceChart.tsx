"use client";

import { useMemo, useState } from "react";
import type { AssetStats } from "@/lib/quant-types";
import { sectorColor } from "@/lib/sectors";

// Real price history for one asset with a range selector, area fill, and range return readout.

const RANGES: { label: string; frac: number }[] = [
  { label: "1M", frac: 21 / 756 }, { label: "3M", frac: 63 / 756 }, { label: "6M", frac: 126 / 756 },
  { label: "1Y", frac: 252 / 756 }, { label: "3Y", frac: 1 },
];
const W = 620, H = 220, M = { top: 12, right: 46, bottom: 20, left: 8 };

export function PriceChart({ asset }: { asset: AssetStats }) {
  const [range, setRange] = useState(4);
  const color = sectorColor(asset.sector);

  const g = useMemo(() => {
    const n = asset.series.length;
    const take = Math.max(4, Math.round(n * RANGES[range].frac));
    const series = asset.series.slice(-take);
    const dates = asset.dates.slice(-take);
    const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
    const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
    const x = (i: number) => M.left + (i / (series.length - 1)) * pw;
    const y = (v: number) => M.top + (1 - (v - lo) / span) * ph;
    const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(series.length - 1).toFixed(1)},${H - M.bottom} L${x(0).toFixed(1)},${H - M.bottom} Z`;
    const ret = series[series.length - 1] / series[0] - 1;
    const yTicks = [lo, lo + span / 2, hi];
    return { line, area, ret, dates, series, x, y, yTicks };
  }, [asset, range]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[15px] font-semibold text-text">{asset.symbol}</span>
          <span className="text-[11px] text-muted">{asset.name}</span>
          <span className={`mono text-[12px] ${g.ret >= 0 ? "pos" : "neg"}`}>{g.ret >= 0 ? "+" : ""}{(g.ret * 100).toFixed(1)}%</span>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r, i) => (
            <button key={r.label} onClick={() => setRange(i)} className={`rounded-sm px-2 py-0.5 mono text-[10px] ${i === range ? "bg-blue/20 text-blue" : "text-faint hover:text-text"}`}>{r.label}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <defs>
          <linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.20" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.yTicks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={g.y(v)} y2={g.y(v)} stroke="rgb(var(--grid))" strokeWidth="1" />
            <text x={W - M.right + 4} y={g.y(v) + 3} className="fill-faint mono" fontSize="9">{v.toFixed(0)}</text>
          </g>
        ))}
        <path key={`a${range}`} d={g.area} fill="url(#pcg)" className="fade-in-soft" />
        <path key={`l${range}`} d={g.line} pathLength={1} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" className="draw-in" />
        <text x={M.left} y={H - 6} className="fill-faint mono" fontSize="9">{g.dates[0]}</text>
        <text x={W - M.right} y={H - 6} textAnchor="end" className="fill-faint mono" fontSize="9">{g.dates[g.dates.length - 1]}</text>
      </svg>
    </div>
  );
}
