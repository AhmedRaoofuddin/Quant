"use client";

import { useEffect, useMemo, useState } from "react";
import type { StrategyResult } from "@/lib/strategies";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, MetricBar, Readout, SectionHead } from "@/components/Panel";
import { CompanyLogo } from "@/components/CompanyLogo";
import { JointCapacity } from "@/components/JointCapacity";
import { Attribution } from "@/components/Attribution";
import type { PortfolioReport } from "@/lib/portfolio";
import type { Attribution as Attr } from "@/lib/attribution";
import type { RegimePerformance } from "@/lib/regime-perf";

type Enriched = StrategyResult & {
  psr: number;
  trials: number;
  attribution: Attr | null;
  regime: RegimePerformance | null;
};

interface Payload {
  asOf: string;
  periodsPerYear: number;
  strategies: Enriched[];
  family: { pbo: number; lambdas: number[]; nCombinations: number; bestId: string; nStrategies: number; verdict: string };
  portfolio: PortfolioReport | null;
  factorPanel: { keys: string[]; nObs: number; annReturns: Record<string, number>; missing: string[] };
  regimeModel: { labels: string[]; currentState: number; stationary: number[]; expectedDuration: number[] } | null;
}

const usd = (v: number) =>
  !Number.isFinite(v) ? "n/a" : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;

/** Compact form for a figure that only pinned to the sweep bound, so it stays inside its column. */
const beyond = (v: number) => `> $${v >= 1e9 ? `${Math.round(v / 1e9)}B` : `${Math.round(v / 1e6)}M`}`;

// One hue per family, so the equity chart groups by kind rather than cycling arbitrarily.
const FAMILY_COLOUR: Record<string, string> = {
  momentum: "#0B2D43", reversal: "#B0413A", volatility: "#4E7CA1",
  trend: "#3d8361", liquidity: "#AD833B", seasonality: "#7A5C8F", quality: "#5C6B75",
};

export function Strategies() {
  const [d, setD] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/strategies").then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error);
      setD(j); setPick(j.strategies[0]?.id ?? null); setState("ready");
    }).catch(() => setState("error"));
  }, []);

  const colours = useMemo(() => {
    const m: Record<string, string> = {};
    d?.strategies.forEach((s) => { m[s.id] = FAMILY_COLOUR[s.family] ?? "#5C6B75"; });
    return m;
  }, [d]);

  if (state === "loading") return <div className="space-y-3"><div className="skeleton h-16" /><div className="skeleton h-96" /></div>;
  if (state === "error" || !d) return <Panel title="Strategies"><p className="text-[13px] text-down">Could not run the strategy library.</p></Panel>;

  const sel = d.strategies.find((s) => s.id === pick) ?? d.strategies[0];
  const best = [...d.strategies].sort((a, b) => b.grossSharpe - a.grossSharpe)[0];
  const mostScalable = [...d.strategies].sort((a, b) => b.capacity.deployableCapacity - a.capacity.deployableCapacity)[0];

  return (
    <div className="space-y-3">
      <SectionHead
        title="Strategy Library"
        sub={`${d.strategies.length} factor strategies backtested on live data, each with its own capacity`}
        right={<span className={`badge ${
          d.family.verdict === "robust" ? "badge-pos"
          : d.family.verdict === "overfit" ? "badge-neg"
          : "badge-warn"}`}>
          FAMILY PBO {fmtPercent(d.family.pbo, 0)} · {d.family.verdict.toUpperCase()}
        </span>}
      />

      <MetricBar>
        <Readout label="Strategies" value={String(d.strategies.length)} sub="tested together" />
        <Readout label="Best Sharpe" value={fmtNumber(best.grossSharpe)} tone="pos" sub={best.name} />
        <Readout label="Most scalable" value={usd(mostScalable.capacity.deployableCapacity)} sub={mostScalable.name} />
        <Readout label="Family PBO" value={fmtPercent(d.family.pbo, 0)} tone={d.family.pbo <= 0.2 ? "pos" : "neg"} sub={`${d.family.nCombinations} CSCV splits`} />
        <Readout label="Verdict" value={d.family.verdict.toUpperCase()} tone={d.family.verdict === "robust" ? "pos" : "neg"} sub="on the family" />
      </MetricBar>

      {/* The headline lesson: Sharpe and capacity disagree. */}
      <Panel title="Sharpe is not the whole story" accent="amber">
        <p className="text-[12.5px] leading-relaxed text-muted">
          <span className="text-text">{best.name}</span> has the highest gross Sharpe at {fmtNumber(best.grossSharpe)},
          but turns over {fmtNumber(best.annualTurnover, 1)}x a year and carries only {usd(best.capacity.deployableCapacity)}.
          {" "}<span className="text-text">{mostScalable.name}</span> has a lower Sharpe of {fmtNumber(mostScalable.grossSharpe)} yet
          carries {usd(mostScalable.capacity.deployableCapacity)}. For anyone allocating real capital the second is usually the
          better business, which is why a Sharpe published without a capacity tells you very little.
        </p>
      </Panel>

      <Panel title="Comparison" bodyClass="p-0" right="click a row to inspect">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Strategy</th><th>Family</th><th>Sharpe</th><th>Alpha t</th><th>Ann ret</th><th>Vol</th><th>Max DD</th>
              <th>Turnover</th><th>PSR</th><th>Deployable</th><th>Binds</th>
            </tr>
          </thead>
          <tbody>
            {d.strategies.map((s) => (
              <tr key={s.id} onClick={() => setPick(s.id)} className={`cursor-pointer ${s.id === pick ? "bg-accent/5" : ""}`}>
                <td className="text-left">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: colours[s.id] }} />
                    <span className="font-medium text-text">{s.name}</span>
                  </span>
                </td>
                <td className="text-right mono text-[11px] uppercase text-faint">{s.family}</td>
                <td className={`text-right mono font-medium ${s.grossSharpe > 1 ? "up" : "text-text"}`}>{fmtNumber(s.grossSharpe)}</td>
                <td className={`text-right mono ${
                  s.attribution && Math.abs(s.attribution.alphaT) >= 2 ? "up font-medium" : "text-faint"}`}>
                  {s.attribution ? fmtNumber(s.attribution.alphaT) : "n/a"}
                </td>
                <td className={`text-right mono ${s.grossAnnReturn >= 0 ? "up" : "down"}`}>{fmtPercent(s.grossAnnReturn, 0)}</td>
                <td className="text-right mono text-muted">{fmtPercent(s.annVol, 0)}</td>
                <td className="text-right mono text-down">{fmtPercent(s.maxDrawdown, 0)}</td>
                <td className={`text-right mono ${s.annualTurnover > 10 ? "down" : "text-muted"}`}>{fmtNumber(s.annualTurnover, 1)}x</td>
                <td className={`text-right mono ${s.psr > 0.9 ? "up" : s.psr < 0.6 ? "down" : "text-muted"}`}>{fmtPercent(s.psr, 0)}</td>
                <td className="text-right mono font-medium text-text">{usd(s.capacity.deployableCapacity)}</td>
                <td className="text-right mono text-[11px] text-muted">{s.capacity.bindingConstraint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.618fr_1fr]">
        <Panel title="Equity curves" accent="green" right="gross of costs, rebased to 1.0">
          <MultiEquity strategies={d.strategies} colours={colours} highlight={pick} />
        </Panel>
        <Panel title={sel.name} accent="blue" right={`${sel.holdings} names`}>
          <div className="flex h-full flex-col">
            <p className="text-[12.5px] leading-relaxed text-muted">{sel.thesis}</p>
            {sel.reference && (
              <p className="mt-1.5 mono text-[11px] text-faint">{sel.reference}</p>
            )}
            {sel.caveat && (
              <p className="mt-2 border-l-2 border-warn/60 pl-2.5 text-[11.5px] leading-relaxed text-warn">
                {sel.caveat}
              </p>
            )}

            <dl className="mt-2.5 grid grid-cols-2 gap-x-5 border-t border-line pt-2.5">
              <Stat k="Rebalance" v={`${sel.rebalanceEvery} periods`} />
              <Stat k="Turnover" v={`${fmtNumber(sel.annualTurnover, 1)}x / yr`} />
              <Stat k="Gross Sharpe" v={fmtNumber(sel.grossSharpe)} />
              <Stat k="Prob. Sharpe" v={fmtPercent(sel.psr, 0)} />
              <Stat k="Deployable" v={usd(sel.capacity.deployableCapacity)} />
              {/* The sweep stops at sweepMaxAum, so a pinned value is a floor, not a number. */}
              <Stat
                k="Alpha dies"
                v={sel.capacity.zeroAlphaUnbounded
                  ? beyond(sel.capacity.sweepMaxAum)
                  : usd(sel.capacity.capacityAtZeroAlpha)}
              />
            </dl>

            <CapacityLadder cap={sel.capacity} />

            <div className="mt-2.5 border-t border-line pt-2">
              <div className="eyebrow mb-1.5">Current holdings</div>
              <div className="flex flex-wrap gap-1.5">
                {sel.book.map((p) => (
                  <span key={p.symbol} className="flex items-center gap-1.5 rounded-[2px] border border-line px-1.5 py-0.5">
                    <CompanyLogo symbol={p.symbol} size={14} />
                    <span className="mono text-[11px] text-text">{p.symbol}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {d.portfolio && (
        <div className="border-t border-line pt-4">
          <JointCapacity p={d.portfolio} />
        </div>
      )}

      <div className="border-t border-line pt-4">
        <Attribution
          strategies={d.strategies.map((s) => ({
            id: s.id, name: s.name, family: s.family,
            grossAnnReturn: s.grossAnnReturn, grossSharpe: s.grossSharpe,
            caveat: s.caveat, reference: s.reference,
            attribution: s.attribution, regime: s.regime,
          }))}
          factorPanel={d.factorPanel}
          regimeModel={d.regimeModel}
        />
      </div>
    </div>
  );
}

/** Label left, value hard right, both on one line. Dotted leader keeps the eye on the row. */
function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-1.5 border-b border-line/60 py-[5px] last:border-0">
      <dt className="eyebrow shrink-0 whitespace-nowrap">{k}</dt>
      <span className="min-w-0 flex-1 translate-y-[-3px] border-b border-dotted border-line" aria-hidden />
      <dd className="mono shrink-0 whitespace-nowrap text-[12px] tabular-nums text-text">{v}</dd>
    </div>
  );
}

/**
 * Where the money runs out, on a log axis. Fills the space under the spec sheet with the one
 * comparison that matters: how far deployable sits below the point alpha dies.
 */
function CapacityLadder({ cap }: { cap: StrategyResult["capacity"] }) {
  const lo = 1e6, hi = cap.sweepMaxAum;
  const pos = (v: number) => Math.max(0, Math.min(1, Math.log10(v / lo) / Math.log10(hi / lo)));

  // A figure pinned to the top of the sweep is a floor, not a location. Label it, do not plot it
  // at the far edge as though the model had found it there.
  const marks = [
    { label: "Deployable", v: cap.deployableCapacity, tone: "bg-accent", capped: false },
    { label: "Peak P&L", v: cap.peakNetPnlAum, tone: "bg-up", capped: cap.peakPnlUnbounded },
    { label: "Alpha dies", v: cap.capacityAtZeroAlpha, tone: "bg-down", capped: cap.zeroAlphaUnbounded },
  ];

  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <div className="eyebrow mb-2">Capacity ladder</div>
      <div className="relative h-1.5 w-full rounded-full bg-line/70">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent/25"
          style={{ width: `${pos(cap.deployableCapacity) * 100}%` }}
        />
        {marks.filter((m) => !m.capped).map((m) => (
          <span
            key={m.label}
            className={`absolute top-1/2 h-3 w-[2.5px] -translate-y-1/2 rounded-full ${m.tone}`}
            style={{ left: `calc(${pos(m.v) * 100}% - 1.25px)` }}
            title={`${m.label}: ${usd(m.v)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {marks.map((m) => (
          <span key={m.label} className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${m.capped ? "bg-line" : m.tone}`} />
            {m.label}
            <span className={`mono tabular-nums ${m.capped ? "text-faint" : "text-text"}`}>
              {m.capped ? beyond(hi) : usd(m.v)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function MultiEquity({ strategies, colours, highlight }: {
  strategies: StrategyResult[]; colours: Record<string, string>; highlight: string | null;
}) {
  const W = 700, H = 320, M = { top: 14, right: 50, bottom: 22, left: 8 };
  const n = Math.min(...strategies.map((s) => s.equity.length));
  if (!n || n < 2) return <div className="grid h-48 place-items-center text-xs text-muted">no history</div>;

  const all = strategies.flatMap((s) => s.equity.slice(-n));
  const lo = Math.min(...all), hi = Math.max(...all);
  const X = (i: number) => M.left + (i / (n - 1)) * (W - M.left - M.right);
  const Y = (v: number) => M.top + (1 - (v - lo) / (hi - lo || 1)) * (H - M.top - M.bottom);
  const dates = strategies[0].dates.slice(-n);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--grid))" strokeWidth="1" />
            <text x={W - M.right + 5} y={Y(v) + 3} className="fill-faint mono" fontSize="10">{v.toFixed(2)}x</text>
          </g>
        ))}
        {strategies.map((s) => {
          const e = s.equity.slice(-n);
          const dim = highlight !== null && s.id !== highlight;
          return (
            <path key={s.id} d={e.map((v, i) => `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}
              pathLength={1} fill="none" stroke={colours[s.id]} strokeWidth={dim ? 1 : 2}
              strokeOpacity={dim ? 0.3 : 1} className="draw-in" />
          );
        })}
        <text x={M.left} y={H - 6} className="fill-faint mono" fontSize="10">{dates[0]}</text>
        <text x={W - M.right} y={H - 6} textAnchor="end" className="fill-faint mono" fontSize="10">{dates[dates.length - 1]}</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {strategies.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: colours[s.id] }} />{s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
