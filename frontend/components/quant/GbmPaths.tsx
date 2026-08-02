"use client";

import { useMemo, useState } from "react";
import type { AssetStats } from "@/lib/quant-types";

// Geometric Brownian Motion Monte Carlo, seeded with the selected asset's real drift (mu) and
// volatility (sigma). dS = mu S dt + sigma S dW. The model behind Black-Scholes and most risk sims.

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r: () => number) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function GbmPaths({ asset, large = false }: { asset: AssetStats; large?: boolean }) {
  const [nPaths, setNPaths] = useState(large ? 70 : 40);
  const W = large ? 760 : 560;
  // Sized so the plot fills the card next to the stacked stat panels instead of leaving slack.
  const H = large ? 545 : 240;
  const M = { top: 12, right: 48, bottom: 20, left: 8 };
  const g = useMemo(() => {
    const S0 = asset.last, mu = asset.annReturn, sigma = asset.annVol;
    const steps = 52, dt = 1 / steps;
    const rand = mulberry32(0xABCDEF);
    const paths: number[][] = [];
    for (let p = 0; p < nPaths; p++) {
      const path = [S0];
      let s = S0;
      for (let t = 0; t < steps; t++) { s *= Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * gauss(rand)); path.push(s); }
      paths.push(path);
    }
    const finals = paths.map((p) => p[p.length - 1]).sort((a, b) => a - b);
    const lo = Math.min(...paths.flat()), hi = Math.max(...paths.flat());
    return { paths, S0, mu, sigma, steps, lo, hi, p5: finals[Math.floor(0.05 * finals.length)], p95: finals[Math.floor(0.95 * finals.length)], med: finals[Math.floor(0.5 * finals.length)] };
  }, [asset, nPaths]);

  const x = (i: number) => M.left + (i / g.steps) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - g.lo) / (g.hi - g.lo || 1)) * (H - M.top - M.bottom);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="mono text-muted">S0 {g.S0.toFixed(0)} · μ {(g.mu * 100).toFixed(0)}% · σ {(g.sigma * 100).toFixed(0)}%</span>
        <span className="flex items-center gap-1.5 text-faint">paths <input type="range" min={10} max={120} value={nPaths} onChange={(e) => setNPaths(+e.target.value)} className="h-1 w-20 accent-blue" /></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {[g.lo, (g.lo + g.hi) / 2, g.hi].map((v, i) => (
          <g key={i}><line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--grid))" strokeWidth="1" /><text x={W - M.right + 4} y={y(v) + 3} className="fill-faint mono" fontSize="9">{v.toFixed(0)}</text></g>
        ))}
        {g.paths.map((p, i) => (
          <path key={`${nPaths}-${i}`} d={p.map((v, t) => `${t === 0 ? "M" : "L"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
            pathLength={1} fill="none" stroke="rgb(var(--series-2))" strokeOpacity="0.4" strokeWidth="1"
            className="draw-in" style={{ animationDelay: `${Math.min(i * 14, 700)}ms` }} />
        ))}
        <line x1={M.left} x2={W - M.right} y1={y(g.S0)} y2={y(g.S0)} stroke="rgb(var(--muted))" strokeDasharray="2 3" strokeWidth="1" />
        <text x={M.left} y={H - 6} className="fill-faint mono" fontSize="9">today</text>
        <text x={W - M.right} y={H - 6} textAnchor="end" className="fill-faint mono" fontSize="9">+1Y</text>
      </svg>
      <div className="mt-1 grid grid-cols-3 gap-2 border-t border-line pt-2 text-center">
        <div><div className="label">5% path</div><div className="mono text-[13px] font-semibold text-red">{g.p5.toFixed(0)}</div></div>
        <div><div className="label">Median</div><div className="mono text-[13px] font-semibold text-text">{g.med.toFixed(0)}</div></div>
        <div><div className="label">95% path</div><div className="mono text-[13px] font-semibold text-green">{g.p95.toFixed(0)}</div></div>
      </div>
    </div>
  );
}
