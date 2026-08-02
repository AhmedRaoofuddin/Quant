"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CapacityReport } from "@/lib/capacity";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, MetricBar, Readout, SectionHead } from "@/components/Panel";
import { CompanyLogo } from "@/components/CompanyLogo";

const usd = (v: number) => {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export function Capacity() {
  const [data, setData] = useState<(CapacityReport & { asOf: string }) | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [grossReturn, setGrossReturn] = useState(0.2);
  const [vol, setVol] = useState(0.1);
  const [turnover, setTurnover] = useState(12);
  const [eta, setEta] = useState(0.55);
  const [names, setNames] = useState(10);

  const load = useCallback(() => {
    const qs = new URLSearchParams({
      grossReturn: String(grossReturn), vol: String(vol),
      turnover: String(turnover), eta: String(eta), n: String(names),
    });
    fetch(`/api/capacity?${qs}`).then((r) => r.json()).then((d) => {
      if (d.error) throw new Error(d.error);
      setData(d); setState("ready");
    }).catch(() => setState("error"));
  }, [grossReturn, vol, turnover, eta, names]);

  useEffect(() => { load(); }, [load]);

  if (state === "loading" && !data) return <div className="space-y-3"><div className="skeleton h-16" /><div className="skeleton h-96" /></div>;
  if (state === "error" || !data) return <Panel title="Capacity"><p className="text-[13px] text-down">Could not compute capacity. Retry shortly.</p></Panel>;

  const r = data;
  const halfPct = r.capacityAtHalfSharpe;

  return (
    <div className="space-y-3">
      <SectionHead
        title="Strategy Capacity"
        sub="How much capital the signal absorbs before its own market impact eats the alpha"
        right={<span className="flex items-center gap-2 text-[12px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-up blink" />live ADV from {r.book.length} names</span>}
      />

      <MetricBar>
        <Readout label="Gross Sharpe" value={fmtNumber(r.grossSharpe)} tone="pos" sub="before costs" />
        <Readout label="Capacity" value={usd(halfPct)} tone="neutral" sub="at half gross Sharpe" />
        <Readout label="Alpha dies at" value={usd(r.capacityAtZeroAlpha)} tone="neg" sub="net return = 0" />
        <Readout label="Peak $ P&L" value={usd(r.peakNetPnlUsd)} tone="pos" sub={`at ${usd(r.peakNetPnlAum)} AUM`} />
        <Readout label="Binding limit" value={r.bindingConstraint.toUpperCase()} tone={r.bindingConstraint === "liquidity" ? "neg" : "neutral"} sub={r.liquidityLimitedAum ? `ADV cap at ${usd(r.liquidityLimitedAum)}` : "impact-driven"} />
        <Readout label="Book" value={String(r.book.length)} sub="equally weighted" />
      </MetricBar>

      {/* assumptions */}
      <div className="card grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-5">
        <Slider label="Gross return" value={grossReturn} min={0.02} max={0.6} step={0.01} onChange={setGrossReturn} fmt={(v) => fmtPercent(v, 0)} />
        <Slider label="Ann. vol" value={vol} min={0.02} max={0.4} step={0.01} onChange={setVol} fmt={(v) => fmtPercent(v, 0)} />
        <Slider label="Turnover / yr" value={turnover} min={1} max={252} step={1} onChange={setTurnover} fmt={(v) => `${v}x`} />
        <Slider label="Impact η" value={eta} min={0.1} max={1.5} step={0.05} onChange={setEta} fmt={(v) => v.toFixed(2)} />
        <Slider label="Book size" value={names} min={3} max={30} step={1} onChange={setNames} fmt={(v) => `${v} names`} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.618fr_1fr]">
        <Panel title="Capacity curve" accent="green" right="net Sharpe vs deployed capital">
          <CapacityCurve r={r} />
        </Panel>
        <Panel title="Liquidity by name" accent="blue" bodyClass="p-0" right="median daily $ volume">
          <div className="max-h-[360px] overflow-y-auto">
            <table className="grid-table">
              <thead><tr><th>Name</th><th>ADV</th><th>Spread</th><th>Max size</th></tr></thead>
              <tbody>
                {[...r.book].sort((a, b) => b.advUsd - a.advUsd).map((p) => (
                  <tr key={p.symbol}>
                    <td className="text-left">
                      <span className="flex items-center gap-2">
                        <CompanyLogo symbol={p.symbol} size={16} />
                        <span className="mono font-semibold text-text">{p.symbol}</span>
                      </span>
                    </td>
                    <td className="text-right mono text-text">{usd(p.advUsd)}</td>
                    <td className="text-right mono text-muted">{p.spreadBps.toFixed(1)}bp</td>
                    <td className="text-right mono text-muted">{usd(p.advUsd * r.assumptions.participationCap / p.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel title="What this answers" accent="cyan">
        <div className="grid gap-4 text-[12.5px] leading-relaxed text-muted md:grid-cols-3">
          <div>
            <div className="mb-1 font-semibold text-text">The question allocators ask</div>
            A gross Sharpe of {fmtNumber(r.grossSharpe)} is not fundable on its own. What matters is the
            size at which it still clears costs. Here that is <span className="text-text">{usd(halfPct)}</span> before
            half the edge is gone, and <span className="text-text">{usd(r.capacityAtZeroAlpha)}</span> before there is
            no edge left at all.
          </div>
          <div>
            <div className="mb-1 font-semibold text-text">Why cost is concave</div>
            Impact follows a square-root law: consuming a larger share of daily volume moves price against you,
            but sub-linearly. Gross P&amp;L grows linearly with capital while cost grows as its square root, so
            dollar profit peaks at <span className="text-text">{usd(r.peakNetPnlAum)}</span> and then falls.
          </div>
          <div>
            <div className="mb-1 font-semibold text-text">What binds first</div>
            {r.bindingConstraint === "liquidity"
              ? <>Liquidity binds before impact does. Some legs exceed {fmtPercent(r.assumptions.participationCap, 0)} of
                daily volume at {usd(r.liquidityLimitedAum)}, so the book cannot be traded at that size regardless of cost.</>
              : <>Impact binds before the participation cap: the strategy is priced out by its own footprint before it
                runs out of shares to trade.</>}
          </div>
        </div>
        <p className="mt-3 border-t border-line pt-2 text-[11px] text-faint">
          Impact model: half-spread + η·σ·√(Q/ADV) + fees, applied twice per round trip and scaled by turnover.
          Almgren-Chriss / BARRA form. ADV is the median daily traded value over the last quarter; the spread is a
          high-low range proxy. Estimates, not execution guarantees.
        </p>
      </Panel>
    </div>
  );
}

function CapacityCurve({ r }: { r: CapacityReport }) {
  const g = useMemo(() => {
    const W = 700, H = 340, M = { top: 16, right: 54, bottom: 34, left: 8 };
    const pts = r.curve;
    const lx = (v: number) => Math.log10(v);
    const x0 = lx(pts[0].aumUsd), x1 = lx(pts[pts.length - 1].aumUsd);
    const yMax = Math.max(r.grossSharpe, 0.1);
    const yMin = Math.min(-0.5, ...pts.map((p) => p.netSharpe));
    const X = (v: number) => M.left + ((lx(v) - x0) / (x1 - x0)) * (W - M.left - M.right);
    const Y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.aumUsd).toFixed(1)},${Y(p.netSharpe).toFixed(1)}`).join(" ");
    const area = `${line} L${X(pts[pts.length - 1].aumUsd)},${Y(Math.max(yMin, 0))} L${X(pts[0].aumUsd)},${Y(Math.max(yMin, 0))} Z`;
    const decades: number[] = [];
    for (let d = Math.ceil(x0); d <= Math.floor(x1); d++) decades.push(Math.pow(10, d));
    return { W, H, M, X, Y, line, area, yMin, yMax, decades };
  }, [r]);

  return (
    <div>
      <svg viewBox={`0 0 ${g.W} ${g.H}`} className="h-auto w-full">
        <defs>
          <linearGradient id="capg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--up))" stopOpacity="0.18" />
            <stop offset="1" stopColor="rgb(var(--up))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[r.grossSharpe, r.grossSharpe / 2, 0].map((v, i) => (
          <g key={i}>
            <line x1={g.M.left} x2={g.W - g.M.right} y1={g.Y(v)} y2={g.Y(v)}
              stroke={i === 2 ? "rgb(var(--down))" : "rgb(var(--grid))"}
              strokeDasharray={i === 0 ? "4 4" : i === 1 ? "3 5" : "0"} strokeWidth="1" />
            <text x={g.W - g.M.right + 5} y={g.Y(v) + 3} className="fill-faint mono" fontSize="10">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={g.area} fill="url(#capg)" />
        <path d={g.line} pathLength={1} fill="none" stroke="rgb(var(--up))" strokeWidth="2" className="draw-in" />

        {/* capacity markers */}
        {[
          { v: r.capacityAtHalfSharpe, c: "rgb(var(--warn))", t: "half Sharpe" },
          { v: r.capacityAtZeroAlpha, c: "rgb(var(--down))", t: "zero alpha" },
        ].map((m, i) => (
          <g key={i}>
            <line x1={g.X(m.v)} x2={g.X(m.v)} y1={g.M.top} y2={g.H - g.M.bottom} stroke={m.c} strokeDasharray="3 3" strokeWidth="1.2" />
            <text x={g.X(m.v)} y={g.M.top + 11 + i * 13} textAnchor="middle" className="mono" fontSize="10" fill={m.c}>
              {usd(m.v)}
            </text>
          </g>
        ))}

        {g.decades.map((d) => (
          <text key={d} x={g.X(d)} y={g.H - 16} textAnchor="middle" className="fill-muted mono" fontSize="10">{usd(d)}</text>
        ))}
        <text x={(g.W - g.M.right) / 2} y={g.H - 3} textAnchor="middle" className="fill-faint mono" fontSize="10">
          deployed capital (log scale)
        </text>
      </svg>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span className="mono text-[12px] font-medium text-text">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full" />
    </div>
  );
}
