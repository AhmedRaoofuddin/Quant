"use client";

import { useEffect, useMemo, useState } from "react";
import type { Instrument, MacroSeries, MarketsData } from "@/lib/markets";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, MetricBar, Readout, SectionHead } from "@/components/Panel";

const GROUPS: Instrument["group"][] = ["Index", "Sector", "Commodity", "FX", "Crypto", "Rates"];
type SortKey = "symbol" | "last" | "chg1d" | "chg1m" | "chg1y" | "annVol";

export function Markets() {
  const [data, setData] = useState<MarketsData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "chg1y", dir: -1 });
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/markets").then((r) => r.json()).then((d) => {
      if (d.error) throw new Error(d.error);
      setData(d); setPicked(d.instruments[0]?.symbol ?? null); setState("ready");
    }).catch(() => setState("error"));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toUpperCase();
    const out = data.instruments.filter((i) =>
      (groups.size === 0 || groups.has(i.group)) &&
      (q === "" || i.symbol.includes(q) || i.name.toUpperCase().includes(q)));
    const k = sort.key;
    return out.sort((a, b) => (k === "symbol" ? a.symbol.localeCompare(b.symbol) : (a[k] as number) - (b[k] as number)) * sort.dir);
  }, [data, groups, query, sort]);

  if (state === "loading") return <div className="space-y-4"><div className="skeleton h-16" /><div className="skeleton h-96" /></div>;
  if (state === "error" || !data) return <Panel title="Markets"><p className="text-[13px] text-down">Could not load market data. Retry shortly.</p></Panel>;

  const spx = data.instruments.find((i) => i.symbol === "^GSPC");
  const vix = data.instruments.find((i) => i.symbol === "^VIX");
  const tnx = data.instruments.find((i) => i.symbol === "^TNX");
  const gold = data.instruments.find((i) => i.symbol === "GC=F");
  const btc = data.instruments.find((i) => i.symbol === "BTC-USD");
  const dxy = data.instruments.find((i) => i.symbol === "DX-Y.NYB");
  const sel = data.instruments.find((i) => i.symbol === picked) ?? null;

  const toggle = (g: string) => setGroups((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const th = (key: SortKey, label: string, left = false) => (
    <th onClick={() => setSort((p) => ({ key, dir: p.key === key ? (p.dir === 1 ? -1 : 1) : -1 }))}
      className={`cursor-pointer select-none ${left ? "text-left" : "text-right"} hover:text-text`}>
      {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      <SectionHead
        title="Global Markets"
        sub={`Cross-asset · ${data.instruments.length} instruments · ${data.macro.length} macro series · as of ${data.asOf.slice(0, 10)}`}
        right={<span className="flex items-center gap-2 text-[12px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-up blink" />Yahoo Finance + FRED</span>}
      />

      <MetricBar>
        <Readout label="S&P 500" value={spx ? fmtNumber(spx.last, 0) : "—"} tone={(spx?.chg1d ?? 0) >= 0 ? "pos" : "neg"} sub={spx ? `${fmtPercent(spx.chg1d, 2)} today` : ""} />
        <Readout label="VIX" value={vix ? fmtNumber(vix.last, 1) : "—"} tone={(vix?.last ?? 0) > 20 ? "neg" : "pos"} sub="volatility" />
        <Readout label="US 10Y" value={tnx ? `${fmtNumber(tnx.last, 2)}%` : "—"} sub="treasury yield" />
        <Readout label="Gold" value={gold ? fmtNumber(gold.last, 0) : "—"} tone={(gold?.chg1y ?? 0) >= 0 ? "pos" : "neg"} sub={gold ? `${fmtPercent(gold.chg1y, 0)} 1y` : ""} />
        <Readout label="Bitcoin" value={btc ? fmtNumber(btc.last, 0) : "—"} tone={(btc?.chg1y ?? 0) >= 0 ? "pos" : "neg"} sub={btc ? `${fmtPercent(btc.chg1y, 0)} 1y` : ""} />
        <Readout label="Dollar Index" value={dxy ? fmtNumber(dxy.last, 1) : "—"} tone={(dxy?.chg1y ?? 0) >= 0 ? "pos" : "neg"} sub={dxy ? `${fmtPercent(dxy.chg1y, 1)} 1y` : ""} />
      </MetricBar>

      {/* filters */}
      <div className="card flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <button key={g} onClick={() => toggle(g)} data-on={groups.has(g) || groups.size === 0} className="chip">{g}</button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search instrument" className="input-field ml-auto w-44" />
        <span className="eyebrow">{rows.length} shown</span>
      </div>

      {/* selected instrument + macro */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.618fr_1fr]">
        <Panel title={sel ? `${sel.name} (${sel.symbol})` : "Instrument"} right={sel ? `${sel.group} · 2y daily` : ""}>
          {sel ? <BigLine series={sel.series} dates={sel.dates} up={sel.chg1y >= 0} /> : <div className="grid h-48 place-items-center text-[12px] text-muted">select an instrument</div>}
        </Panel>
        <Panel title="Macro indicators" right="FRED">
          <div className="space-y-3">
            {data.macro.map((m) => <MacroRow key={m.id} m={m} />)}
          </div>
        </Panel>
      </div>

      {/* grouped cross-asset grid */}
      {GROUPS.filter((g) => groups.size === 0 || groups.has(g)).map((g) => {
        const inGroup = rows.filter((i) => i.group === g);
        if (!inGroup.length) return null;
        return (
          <div key={g} className="space-y-2">
            <div className="eyebrow">{g}</div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
              {inGroup.map((i) => (
                <button key={i.symbol} onClick={() => setPicked(i.symbol)}
                  className={`card text-left transition-colors hover:border-accent/40 ${i.symbol === picked ? "ring-1 ring-accent/50" : ""}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="mono truncate text-[12px] font-semibold text-text">{i.symbol}</span>
                    <span className={`mono text-[12px] ${i.chg1d >= 0 ? "up" : "down"}`}>{fmtPercent(i.chg1d, 2)}</span>
                  </div>
                  <div className="truncate text-[11px] text-faint">{i.name}</div>
                  <Spark series={i.series} up={i.chg1y >= 0} />
                  <div className="flex items-baseline justify-between">
                    <span className="mono text-[13px] text-text">{fmtNumber(i.last, i.last > 500 ? 0 : 2)}</span>
                    <span className={`mono text-[11px] ${i.chg1y >= 0 ? "up" : "down"}`}>{fmtPercent(i.chg1y, 0)} 1y</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* full table */}
      <Panel title="All instruments" bodyClass="p-0" right={`${rows.length} rows`}>
        <div className="max-h-[420px] overflow-auto">
          <table className="grid-table">
            <thead><tr>{th("symbol", "Instrument", true)}<th className="text-left">Class</th>{th("last", "Last")}{th("chg1d", "1D")}{th("chg1m", "1M")}{th("chg1y", "1Y")}{th("annVol", "Ann Vol")}<th className="text-right">Trend</th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.symbol} onClick={() => setPicked(i.symbol)} className={`cursor-pointer ${i.symbol === picked ? "bg-accent/5" : ""}`}>
                  <td className="text-left"><span className="mono font-semibold text-text">{i.symbol}</span> <span className="text-[11px] text-faint">{i.name}</span></td>
                  <td className="text-left text-[11px] text-muted">{i.group}</td>
                  <td className="text-right mono text-text">{fmtNumber(i.last, i.last > 500 ? 0 : 2)}</td>
                  <td className={`text-right mono ${i.chg1d >= 0 ? "up" : "down"}`}>{fmtPercent(i.chg1d, 2)}</td>
                  <td className={`text-right mono ${i.chg1m >= 0 ? "up" : "down"}`}>{fmtPercent(i.chg1m, 1)}</td>
                  <td className={`text-right mono ${i.chg1y >= 0 ? "up" : "down"}`}>{fmtPercent(i.chg1y, 1)}</td>
                  <td className="text-right mono text-muted">{fmtPercent(i.annVol, 0)}</td>
                  <td className="text-right"><Spark series={i.series} up={i.chg1y >= 0} small /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Spark({ series, up, small }: { series: number[]; up: boolean; small?: boolean }) {
  const d = series.length > 40 ? series.filter((_, i) => i % Math.ceil(series.length / 40) === 0) : series;
  if (d.length < 2) return null;
  const lo = Math.min(...d), hi = Math.max(...d), span = hi - lo || 1;
  const W = small ? 64 : 150, H = small ? 16 : 34;
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * W},${H - ((v - lo) / span) * H}`).join(" ");
  const color = up ? "rgb(var(--up))" : "rgb(var(--down))";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={small ? "inline-block align-middle" : "my-2 w-full"} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}

function BigLine({ series, dates, up }: { series: number[]; dates: string[]; up: boolean }) {
  const W = 620, H = 250, M = { top: 12, right: 48, bottom: 20, left: 6 };
  if (series.length < 2) return null;
  const lo = Math.min(...series), hi = Math.max(...series), span = hi - lo || 1;
  const x = (i: number) => M.left + (i / (series.length - 1)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - lo) / span) * (H - M.top - M.bottom);
  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const color = up ? "rgb(var(--up))" : "rgb(var(--down))";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs><linearGradient id="mkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.18" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {[lo, (lo + hi) / 2, hi].map((v, i) => (
        <g key={i}>
          <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="rgb(var(--grid))" strokeWidth="1" />
          <text x={W - M.right + 5} y={y(v) + 3} className="fill-faint mono" fontSize="9">{v > 1000 ? v.toFixed(0) : v.toFixed(2)}</text>
        </g>
      ))}
      <path d={`${line} L${x(series.length - 1)},${H - M.bottom} L${x(0)},${H - M.bottom} Z`} fill="url(#mkg)" />
      <path d={line} pathLength={1} fill="none" stroke={color} strokeWidth="1.75" className="draw-in" />
      <text x={M.left} y={H - 5} className="fill-faint mono" fontSize="9">{dates[0]}</text>
      <text x={W - M.right} y={H - 5} textAnchor="end" className="fill-faint mono" fontSize="9">{dates[dates.length - 1]}</text>
    </svg>
  );
}

function MacroRow({ m }: { m: MacroSeries }) {
  const delta = m.last - m.prev;
  const d = m.values.slice(-60);
  const lo = Math.min(...d), hi = Math.max(...d), span = hi - lo || 1;
  const W = 110, H = 22;
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * W},${H - ((v - lo) / span) * H}`).join(" ");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="truncate text-[12.5px] text-text">{m.name}</div>
        <div className="eyebrow">{m.id}</div>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.3" strokeOpacity="0.75" />
      </svg>
      <div className="shrink-0 text-right">
        <div className="mono text-[13px] font-semibold text-text">{fmtNumber(m.last, 2)}</div>
        <div className={`mono text-[10px] ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)}</div>
      </div>
    </div>
  );
}
