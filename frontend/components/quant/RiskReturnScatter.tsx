"use client";

import { useMemo, useRef, useState } from "react";
import type { AssetStats } from "@/lib/quant-types";
import { SECTOR_COLORS, sectorColor } from "@/lib/sectors";

// Annualised return vs volatility, coloured by sector, sized by Sharpe. The core research view:
// upper-left is the efficient corner (high return, low risk), the diagonal is Sharpe = 1.

const W = 620, H = 420, M = { top: 16, right: 16, bottom: 40, left: 48 };

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function unit(x: number, y: number): [number, number] { const n = Math.hypot(x, y) || 1; return [x / n, y / n]; }

export function RiskReturnScatter({ assets, selected, onSelect }: { assets: AssetStats[]; selected: string | null; onSelect: (s: string) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  const g = useMemo(() => {
    const xs = assets.map((a) => a.annVol), ys = assets.map((a) => a.annReturn);
    const xMax = Math.max(0.1, ...xs) * 1.08;
    const yMin = Math.min(0, ...ys) * 1.1, yMax = Math.max(0.1, ...ys) * 1.1;
    const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
    const x = (v: number) => M.left + (v / xMax) * pw;
    const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * ph;
    const pts = assets.map((a) => ({ a, cx: x(a.annVol), cy: y(a.annReturn), r: Math.max(3.5, Math.min(12, 4 + a.sharpe * 2.2)) }));
    const xTicks = Array.from({ length: 5 }, (_, i) => (xMax * i) / 4);
    const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
    return { x, y, pts, xTicks, yTicks, xMax, yMin, yMax };
  }, [assets]);

  const ellipses = useMemo(() => {
    const bySector = new Map<string, { v: number; r: number }[]>();
    for (const a of assets) {
      if (!bySector.has(a.sector)) bySector.set(a.sector, []);
      bySector.get(a.sector)!.push({ v: a.annVol, r: a.annReturn });
    }
    const out: { path: string; color: string }[] = [];
    bySector.forEach((pts, sector) => {
      if (pts.length < 3) return;
      const mv = avg(pts.map((p) => p.v)), mr = avg(pts.map((p) => p.r));
      let a = 0, b = 0, c = 0;
      for (const p of pts) { a += (p.v - mv) ** 2; b += (p.v - mv) * (p.r - mr); c += (p.r - mr) ** 2; }
      a /= pts.length; b /= pts.length; c /= pts.length;
      const tr = a + c, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (a * c - b * b)));
      const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
      const e1 = unit(b, l1 - a), e2 = unit(b, l2 - a);
      const k = 1.7, r1 = k * Math.sqrt(Math.max(l1, 1e-9)), r2 = k * Math.sqrt(Math.max(l2, 1e-9));
      let path = "";
      for (let t = 0; t <= 40; t++) {
        const th = (t / 40) * 2 * Math.PI;
        const dv = Math.cos(th) * r1 * e1[0] + Math.sin(th) * r2 * e2[0];
        const dr = Math.cos(th) * r1 * e1[1] + Math.sin(th) * r2 * e2[1];
        path += `${t === 0 ? "M" : "L"}${g.x(mv + dv).toFixed(1)},${g.y(mr + dr).toFixed(1)}`;
      }
      out.push({ path: path + "Z", color: sectorColor(sector) });
    });
    return out;
  }, [assets, g]);

  function move(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    let best: string | null = null, bd = 400;
    for (const p of g.pts) { const d = (p.cx - mx) ** 2 + (p.cy - my) ** 2; if (d < bd) { bd = d; best = p.a.symbol; } }
    setHover(best);
  }

  const hp = g.pts.find((p) => p.a.symbol === hover);

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseMove={move} onMouseLeave={() => setHover(null)}>
        {g.yTicks.map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={g.y(v)} y2={g.y(v)} stroke="rgb(var(--grid))" strokeWidth="1" />
            <text x={M.left - 6} y={g.y(v) + 3} textAnchor="end" className="fill-faint mono" fontSize="9">{(v * 100).toFixed(0)}%</text>
          </g>
        ))}
        {g.xTicks.map((v, i) => (
          <text key={i} x={g.x(v)} y={H - M.bottom + 14} textAnchor="middle" className="fill-faint mono" fontSize="9">{(v * 100).toFixed(0)}%</text>
        ))}
        {/* zero-return line + Sharpe=1 diagonal */}
        {g.yMin < 0 && <line x1={M.left} x2={W - M.right} y1={g.y(0)} y2={g.y(0)} stroke="rgb(var(--line-2))" strokeWidth="1" />}
        <line x1={g.x(0)} y1={g.y(0)} x2={g.x(Math.min(g.xMax, g.yMax))} y2={g.y(Math.min(g.xMax, g.yMax))} stroke="rgb(var(--muted))" strokeOpacity="0.4" strokeDasharray="3 4" strokeWidth="1" />
        <text x={W - M.right} y={M.top + 10} textAnchor="end" className="fill-faint mono" fontSize="9">Sharpe = 1</text>

        {/* fitted 1.7-sigma covariance ellipses per sector */}
        {ellipses.map((e, i) => (
          <path key={i} d={e.path} pathLength={1} fill={e.color} fillOpacity={0.05} stroke={e.color} strokeOpacity={0.45} strokeWidth={1}
            className="draw-in" style={{ animationDelay: `${i * 90}ms` }} />
        ))}

        {g.pts.map((p, i) => {
          const sel = p.a.symbol === selected, hov = p.a.symbol === hover;
          return (
            <circle key={p.a.symbol} cx={p.cx} cy={p.cy} r={sel || hov ? p.r + 1.5 : p.r}
              fill={sectorColor(p.a.sector)} fillOpacity={sel || hov ? 1 : 0.82}
              stroke={sel ? "#fff" : hov ? "rgb(var(--text))" : "none"} strokeWidth={sel ? 2 : 1}
              className="pop-in cursor-pointer transition-[r,fill-opacity] duration-150"
              style={{ animationDelay: `${Math.min(i * 22, 700)}ms` }}
              onClick={() => onSelect(p.a.symbol)} />
          );
        })}

        <text x={(W) / 2} y={H - 4} textAnchor="middle" className="fill-muted mono" fontSize="10">Annualised volatility</text>
        <text x={-H / 2} y={12} transform="rotate(-90)" textAnchor="middle" className="fill-muted mono" fontSize="10">Annualised return</text>
      </svg>

      {hp && (
        <div className="pointer-events-none absolute z-10 rounded-sm border border-line-2 bg-panel-2 px-2 py-1 mono text-[10px]"
          style={{ left: `${(hp.cx / W) * 100}%`, top: `${(hp.cy / H) * 100}%`, transform: "translate(-50%, -120%)" }}>
          <div className="text-[11px] font-semibold text-text">{hp.a.symbol}</div>
          <div className="text-muted">ret {(hp.a.annReturn * 100).toFixed(0)}% · vol {(hp.a.annVol * 100).toFixed(0)}%</div>
          <div className={hp.a.sharpe > 1 ? "pos" : "text-muted"}>Sharpe {hp.a.sharpe.toFixed(2)}</div>
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1">
        {Object.entries(SECTOR_COLORS).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1 mono text-[9.5px] text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{s}
          </span>
        ))}
      </div>
    </div>
  );
}
