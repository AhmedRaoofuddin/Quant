"use client";

import { useState } from "react";
import type { AssetStats } from "@/lib/quant-types";

// Real OHLC candlesticks for the selected asset, with a range selector.

const RANGES = [30, 60, 90, 130];

export function Candlestick({ asset, wide = false }: { asset: AssetStats; wide?: boolean }) {
  const [n, setN] = useState(60);
  // A full-width card needs a wider canvas, otherwise the aspect ratio makes it tower.
  const W = wide ? 1160 : 620;
  const H = wide ? 400 : 240;
  const M = { top: 12, right: 52, bottom: 20, left: 6 };
  const bars = asset.ohlc.slice(-n);
  if (bars.length < 2) return <div className="grid h-40 place-items-center text-xs text-muted">no OHLC data</div>;

  const lo = Math.min(...bars.map((b) => b.l)), hi = Math.max(...bars.map((b) => b.h));
  const span = hi - lo || 1;
  const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
  const x = (i: number) => M.left + (i + 0.5) * (pw / bars.length);
  const y = (v: number) => M.top + (1 - (v - lo) / span) * ph;
  const bw = Math.max(1.5, (pw / bars.length) * 0.62);
  const yTicks = [lo, lo + span / 2, hi];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="mono text-[12px] text-muted">{asset.symbol} · daily OHLC</span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setN(r)} className={`rounded-sm px-2 py-0.5 mono text-[10px] ${n === r ? "bg-blue/20 text-blue" : "text-faint hover:text-text"}`}>{r}d</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--grid))" strokeWidth="1" />
            <text x={W - M.right + 4} y={y(v) + 3} className="fill-faint mono" fontSize="9">{v.toFixed(0)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const up = b.c >= b.o;
          const col = up ? "rgb(var(--green))" : "rgb(var(--red))";
          const yo = y(b.o), yc = y(b.c);
          return (
            <g key={`${n}-${i}`} stroke={col} className="pop-in" style={{ animationDelay: `${Math.min(i * 6, 600)}ms` }}>
              <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} strokeWidth="1" />
              <rect x={x(i) - bw / 2} y={Math.min(yo, yc)} width={bw} height={Math.max(1, Math.abs(yc - yo))} fill={col} stroke="none" />
            </g>
          );
        })}
        <text x={M.left} y={H - 5} className="fill-faint mono" fontSize="9">{bars[0].d}</text>
        <text x={W - M.right} y={H - 5} textAnchor="end" className="fill-faint mono" fontSize="9">{bars[bars.length - 1].d}</text>
      </svg>
    </div>
  );
}
