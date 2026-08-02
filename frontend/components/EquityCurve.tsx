"use client";

import { useMemo, useRef, useState } from "react";

// Out-of-sample equity curve, terminal style: green line on a dark grid, monospace axes,
// crosshair + readout on hover.

const W = 900;
const H = 320;
const M = { top: 14, right: 54, bottom: 22, left: 6 };

export function EquityCurve({ equity, dates }: { equity: number[]; dates: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    if (equity.length < 2) return null;
    const min = Math.min(...equity, 1);
    const max = Math.max(...equity, 1);
    const pad = (max - min) * 0.1 || 0.02;
    const lo = min - pad, hi = max + pad;
    const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
    const x = (i: number) => M.left + (i / (equity.length - 1)) * pw;
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * ph;
    const line = equity.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `${line} L${x(equity.length - 1).toFixed(1)},${H - M.bottom} L${x(0).toFixed(1)},${H - M.bottom} Z`;
    const yTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
    return { lo, hi, x, y, line, area, yTicks, base: lo <= 1 && hi >= 1 };
  }, [equity]);

  if (!g) return <div className="grid h-48 place-items-center text-xs text-muted">No equity data.</div>;

  const total = equity[equity.length - 1] - 1;
  const hi = hover ?? equity.length - 1;
  const hx = g.x(hi), hy = g.y(equity[hi]);
  const up = total >= 0;

  function move(e: React.MouseEvent) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - M.left) / (W - M.left - M.right)) * (equity.length - 1));
    setHover(Math.max(0, Math.min(equity.length - 1, i)));
  }

  return (
    <div ref={ref} className="relative w-full" onMouseMove={move} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none">
        <defs>
          <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--green))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgb(var(--green))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {g.yTicks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={g.y(v)} y2={g.y(v)} stroke="rgb(var(--grid))" strokeWidth="1" />
            <text x={W - M.right + 6} y={g.y(v) + 3} className="fill-faint mono" fontSize="10">
              {((v - 1) * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {g.base && <line x1={M.left} x2={W - M.right} y1={g.y(1)} y2={g.y(1)} stroke="rgb(var(--border-2))" strokeDasharray="2 4" strokeWidth="1" />}

        <path d={g.area} fill="url(#eqg)" />
        <path d={g.line} fill="none" stroke={up ? "rgb(var(--green))" : "rgb(var(--red))"} strokeWidth="1.75" strokeLinejoin="round" />

        {[0, Math.floor(equity.length / 2), equity.length - 1].map((i) => (
          <text key={i} x={g.x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === equity.length - 1 ? "end" : "middle"} className="fill-faint mono" fontSize="10">
            {dates[i]?.slice(0, 7)}
          </text>
        ))}

        <line x1={hx} x2={hx} y1={M.top} y2={H - M.bottom} stroke="rgb(var(--muted))" strokeOpacity="0.4" strokeWidth="1" />
        <circle cx={hx} cy={hy} r="3.5" fill={up ? "rgb(var(--green))" : "rgb(var(--red))"} stroke="rgb(var(--panel))" strokeWidth="2" />
      </svg>

      <div
        className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-sm border border-line-2 bg-panel-2 px-2 py-1 text-center"
        style={{ left: `${(hx / W) * 100}%`, opacity: hover === null ? 0 : 1, transition: "opacity .1s" }}
      >
        <div className="mono text-[9px] text-faint">{dates[hi]?.slice(0, 10)}</div>
        <div className={`mono text-[12px] font-semibold ${equity[hi] - 1 >= 0 ? "pos" : "neg"}`}>
          {((equity[hi] - 1) * 100).toFixed(2)}%
        </div>
      </div>
    </div>
  );
}
