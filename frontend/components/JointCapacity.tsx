"use client";

import type { PortfolioReport } from "@/lib/portfolio";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, SectionHead } from "@/components/Panel";

/**
 * Joint capacity: the headline is the gap between what the parts claim and what the whole
 * carries. Everything else on this surface exists to explain that one number.
 */

const usd = (v: number) =>
  !Number.isFinite(v) ? "n/a"
    : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B`
    : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M`
    : `$${v.toFixed(0)}`;

export function JointCapacity({ p }: { p: PortfolioReport }) {
  const funded = p.allocation.filter((a) => a.weight > 0.001);
  const lost = p.naiveSumCapacity - p.jointCapacity;

  return (
    <div className="space-y-3">
      <SectionHead
        title="Joint capacity"
        sub="Capacity does not add up: strategies holding the same names compete for the same liquidity"
        right={
          <span className="badge badge-neg">
            OVERLAP TAX {fmtPercent(p.overlapTax, 0)}
          </span>
        }
      />

      {/* The comparison the whole feature exists to make. */}
      <Panel title="Sum of the parts is not the whole" accent="amber">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <Figure
            label="Naive sum of capacities"
            value={usd(p.naiveSumCapacity)}
            sub="what you get by adding each strategy's own limit"
            tone="muted"
          />
          <Divider symbol="&minus;" />
          <Figure
            label="Lost to overlap"
            value={usd(lost)}
            sub={`${funded.length} strategies share ${p.nameCount} names`}
            tone="neg"
          />
          <Divider symbol="=" />
          <Figure
            label="Actually deployable"
            value={p.jointCapacityUnbounded ? `> ${usd(p.sweepMaxAum)}` : usd(p.jointCapacity)}
            sub={`first name to hit its ADV cap: ${p.bindingSymbol || "n/a"}`}
            tone="pos"
          />
        </div>

        <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
          Every strategy here was sized on its own book, and summing those figures gives{" "}
          <span className="mono text-text">{usd(p.naiveSumCapacity)}</span>. Run together they hold{" "}
          <span className="text-text">{p.nameCount}</span> distinct names between them, so a name two
          strategies both want carries both positions against one day&rsquo;s volume. The blend
          reaches its participation cap at{" "}
          <span className="mono text-text">{usd(p.jointCapacity)}</span>, which is{" "}
          <span className="text-down">{fmtPercent(p.overlapTax, 0)} less</span> than the sum implies.
          Multi-strategy books that size each sleeve independently are the ones that discover this
          in production rather than in research.
        </p>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Capital allocation" accent="blue" right="long-only max-Sharpe, shrunk covariance">
          <AllocationBars allocation={funded} />
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-line pt-2.5 sm:grid-cols-4">
            <Metric k="Blended Sharpe" v={fmtNumber(p.blendedSharpe)} tone="pos" />
            <Metric k="Equal weight" v={fmtNumber(p.equalWeightSharpe)} />
            <Metric k="Diversification" v={`${fmtNumber(p.diversificationRatio)}x`} />
            <Metric k="Avg correlation" v={fmtNumber(p.avgCorrelation)} tone={p.avgCorrelation > 0.6 ? "neg" : undefined} />
          </dl>
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            The optimiser beats equal weight by{" "}
            {fmtNumber(p.blendedSharpe - p.equalWeightSharpe)} Sharpe. A diversification ratio of{" "}
            {fmtNumber(p.diversificationRatio)}x means the blend&rsquo;s volatility is that much
            below the weighted average of its parts. Weights are fitted in sample and will not
            repeat out of sample.
          </p>
        </Panel>

        <Panel title="Most overlapping pairs" accent="red" right="shared book weight">
          {p.topOverlaps.length === 0 ? (
            <p className="text-[12.5px] text-muted">No funded pair shares holdings.</p>
          ) : (
            <div className="space-y-2">
              {p.topOverlaps.map((o) => (
                <div key={`${o.a}-${o.b}`} className="border-b border-line/60 pb-2 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-text">
                      {o.a} <span className="text-faint">+</span> {o.b}
                    </span>
                    <span className="mono shrink-0 text-[12px] text-down">{fmtPercent(o.overlap, 0)}</span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-line">
                    <div className="h-1 rounded-full bg-down/70" style={{ width: `${Math.min(100, o.overlap * 100)}%` }} />
                  </div>
                  <div className="mt-1 mono text-[10.5px] text-faint">
                    return correlation {fmtNumber(o.correlation)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Joint capacity curve" accent="green" right="net Sharpe of the blended book">
        <JointCurve p={p} />
      </Panel>
    </div>
  );
}

function Figure({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: "pos" | "neg" | "muted";
}) {
  const colour = tone === "pos" ? "text-up" : tone === "neg" ? "text-down" : "text-text";
  return (
    <div>
      <div className="eyebrow mb-1.5">{label}</div>
      <div className={`mono text-[30px] font-semibold leading-none tabular-nums ${colour}`}>{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-faint">{sub}</div>
    </div>
  );
}

function Divider({ symbol }: { symbol: string }) {
  return (
    <div className="hidden items-center justify-center lg:flex">
      <span className="mono text-[26px] text-faint">{symbol}</span>
    </div>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <dt className="eyebrow">{k}</dt>
      <dd className={`mono text-[15px] tabular-nums ${tone === "pos" ? "text-up" : tone === "neg" ? "text-down" : "text-text"}`}>
        {v}
      </dd>
    </div>
  );
}

function AllocationBars({ allocation }: { allocation: { id: string; name: string; weight: number }[] }) {
  const max = Math.max(...allocation.map((a) => a.weight), 0.01);
  return (
    <div className="space-y-1.5">
      {allocation.map((a) => (
        <div key={a.id} className="flex items-center gap-2.5">
          <span className="w-[188px] shrink-0 truncate text-[12px] text-text" title={a.name}>{a.name}</span>
          <span className="h-3 flex-1 rounded-[2px] bg-line/60">
            <span
              className="block h-3 rounded-[2px] bg-accent/75 grow-x"
              style={{ width: `${(a.weight / max) * 100}%` }}
            />
          </span>
          <span className="w-[52px] shrink-0 text-right mono text-[12px] tabular-nums text-text">
            {fmtPercent(a.weight, 1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function JointCurve({ p }: { p: PortfolioReport }) {
  const W = 760, H = 260, M = { top: 14, right: 56, bottom: 26, left: 46 };
  const pts = p.curve.filter((c) => Number.isFinite(c.netSharpe));
  if (pts.length < 2) return <div className="grid h-40 place-items-center text-xs text-muted">no curve</div>;

  const lo = Math.min(...pts.map((c) => c.netSharpe));
  const hi = Math.max(...pts.map((c) => c.netSharpe));
  const x0 = Math.log10(pts[0].aumUsd), x1 = Math.log10(pts[pts.length - 1].aumUsd);
  const X = (v: number) => M.left + ((Math.log10(v) - x0) / (x1 - x0)) * (W - M.left - M.right);
  const Y = (v: number) => M.top + (1 - (v - lo) / (hi - lo || 1)) * (H - M.top - M.bottom);

  const path = pts.map((c, i) => `${i === 0 ? "M" : "L"}${X(c.aumUsd).toFixed(1)},${Y(c.netSharpe).toFixed(1)}`).join(" ");
  const jx = X(Math.min(Math.max(p.jointCapacity, pts[0].aumUsd), pts[pts.length - 1].aumUsd));
  const nx = X(Math.min(Math.max(p.naiveSumCapacity, pts[0].aumUsd), pts[pts.length - 1].aumUsd));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={M.left} x2={W - M.right} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--grid))" strokeWidth="1" />
            <text x={M.left - 8} y={Y(v) + 3} textAnchor="end" className="fill-faint mono" fontSize="10">{v.toFixed(1)}</text>
          </g>
        ))}
        {lo < 0 && hi > 0 && (
          <line x1={M.left} x2={W - M.right} y1={Y(0)} y2={Y(0)} stroke="rgb(var(--down))" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        )}

        {/* Where the sum-of-parts figure would put you, versus where the blend actually stops. */}
        <line x1={nx} x2={nx} y1={M.top} y2={H - M.bottom} stroke="rgb(var(--muted))" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        <text x={nx} y={M.top - 3} textAnchor="middle" className="fill-muted mono" fontSize="10">naive sum</text>

        <line x1={jx} x2={jx} y1={M.top} y2={H - M.bottom} stroke="rgb(var(--accent))" strokeWidth="2" />
        <text x={jx} y={M.top - 3} textAnchor="middle" className="fill-accent mono" fontSize="10" fontWeight="600">joint limit</text>

        <path d={path} pathLength={1} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" className="draw-in" />

        <text x={M.left} y={H - 8} className="fill-faint mono" fontSize="10">{usd(pts[0].aumUsd)}</text>
        <text x={W - M.right} y={H - 8} textAnchor="end" className="fill-faint mono" fontSize="10">{usd(pts[pts.length - 1].aumUsd)}</text>
        <text x={M.left - 8} y={M.top - 4} textAnchor="end" className="fill-faint mono" fontSize="10">SR</text>
      </svg>
      <p className="mt-1 text-[11.5px] text-faint">
        Net Sharpe of the blended book as capital grows. The gap between the two markers is the
        capacity a sum-of-parts estimate would hand you that does not exist.
      </p>
    </div>
  );
}
