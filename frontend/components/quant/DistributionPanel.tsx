"use client";

import { useMemo } from "react";
import type { AssetStats } from "@/lib/quant-types";

// Empirical return distribution of the selected asset with a fitted Normal PDF overlaid. Shows
// how far real returns depart from Gaussian (skew, fat tails), the assumption behind VaR, CAPM,
// and Black-Scholes.

const W = 560, H = 220, M = { top: 10, right: 10, bottom: 24, left: 10 };

export function DistributionPanel({ asset }: { asset: AssetStats }) {
  const stats = useMemo(() => {
    const s = asset.series, r: number[] = [];
    for (let i = 1; i < s.length; i++) r.push(s[i] / s[i - 1] - 1);
    const n = r.length;
    const mean = r.reduce((a, b) => a + b, 0) / n;
    const varr = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(varr);
    const skew = r.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n;
    const kurt = r.reduce((a, b) => a + ((b - mean) / sd) ** 4, 0) / n;

    const lo = mean - 4 * sd, hi = mean + 4 * sd, bins = 26, bw = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    for (const x of r) { const i = Math.floor((x - lo) / bw); if (i >= 0 && i < bins) counts[i]++; }
    const dens = counts.map((c) => c / (n * bw));
    const pdf = (x: number) => Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
    const curve = Array.from({ length: 80 }, (_, i) => { const x = lo + (i / 79) * (hi - lo); return { x, y: pdf(x) }; });
    const maxY = Math.max(...dens, ...curve.map((c) => c.y)) || 1;
    const var95 = mean - 1.645 * sd;
    return { r, mean, sd, skew, kurt, lo, hi, bw, dens, curve, maxY, var95, bins };
  }, [asset]);

  const x = (v: number) => M.left + ((v - stats.lo) / (stats.hi - stats.lo)) * (W - M.left - M.right);
  const y = (d: number) => M.top + (1 - d / stats.maxY) * (H - M.top - M.bottom);
  const bwPx = (W - M.left - M.right) / stats.bins;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {stats.dens.map((d, i) => {
          const cx = x(stats.lo + (i + 0.5) * stats.bw);
          return <rect key={i} x={cx - bwPx / 2 + 0.5} y={y(d)} width={bwPx - 1} height={H - M.bottom - y(d)} fill="rgb(var(--accent))" opacity="0.4"
            className="grow-y" style={{ transformOrigin: `center ${H - M.bottom}px`, animationDelay: `${i * 18}ms` }} />;
        })}
        <path d={stats.curve.map((c, i) => `${i === 0 ? "M" : "L"}${x(c.x).toFixed(1)},${y(c.y).toFixed(1)}`).join(" ")}
          pathLength={1} fill="none" stroke="rgb(var(--warn))" strokeWidth="2" strokeLinecap="round"
          className="draw-in" style={{ animationDelay: "250ms" }} />
        <line x1={x(stats.var95)} x2={x(stats.var95)} y1={M.top} y2={H - M.bottom} stroke="rgb(var(--red))" strokeDasharray="3 3" strokeWidth="1" />
        <text x={x(stats.var95)} y={M.top + 8} textAnchor="middle" className="fill-red mono" fontSize="8">VaR 95%</text>
        <line x1={x(0)} x2={x(0)} y1={M.top} y2={H - M.bottom} stroke="rgb(var(--line-2))" strokeWidth="1" />
        <text x={M.left} y={H - 8} className="fill-faint mono" fontSize="9">{(stats.lo * 100).toFixed(1)}%</text>
        <text x={W - M.right} y={H - 8} textAnchor="end" className="fill-faint mono" fontSize="9">{(stats.hi * 100).toFixed(1)}%</text>
        <text x={x(0)} y={H - 8} textAnchor="middle" className="fill-faint mono" fontSize="9">0</text>
      </svg>
      <div className="mt-1 grid grid-cols-4 gap-2 border-t border-line pt-2 text-center">
        <Stat k="Mean" v={`${(stats.mean * 100).toFixed(2)}%`} />
        <Stat k="Std" v={`${(stats.sd * 100).toFixed(2)}%`} />
        <Stat k="Skew" v={stats.skew.toFixed(2)} tone={Math.abs(stats.skew) > 0.5 ? "neg" : ""} />
        <Stat k="Kurtosis" v={stats.kurt.toFixed(2)} tone={stats.kurt > 4 ? "neg" : ""} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mono text-[9px] text-faint">applied in</span>
        {["VaR", "CAPM", "Black-Scholes", "Risk models"].map((t) => (
          <span key={t} className="rounded-sm border border-line-2 px-1.5 py-0.5 mono text-[9px] text-muted">{t}</span>
        ))}
        <span className="ml-auto mono text-[9px] text-amber">amber = fitted Normal</span>
      </div>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "neg" | "" }) {
  return <div><div className="label">{k}</div><div className={`mono text-[13px] font-semibold ${tone === "neg" ? "text-red" : "text-text"}`}>{v}</div></div>;
}
