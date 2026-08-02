"use client";

import { useEffect, useMemo, useState } from "react";
import type { UniverseData } from "@/lib/quant-types";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { sectorColor } from "@/lib/sectors";
import { Panel, MetricBar, Readout, SectionHead } from "@/components/Panel";
import { RiskReturnScatter } from "@/components/quant/RiskReturnScatter";
import { SectorBars } from "@/components/quant/SectorBars";
import { AssetHeatmap } from "@/components/quant/AssetHeatmap";
import { PriceChart } from "@/components/quant/PriceChart";
import { MarketHeatmap } from "@/components/quant/MarketHeatmap";
import { AnalyticalCards } from "@/components/quant/AnalyticalCards";
import { Candlestick } from "@/components/quant/Candlestick";
import { Surface3D } from "@/components/quant/Surface3D";
import { DistributionPanel } from "@/components/quant/DistributionPanel";
import { GbmPaths } from "@/components/quant/GbmPaths";
import { BlackScholes } from "@/components/quant/BlackScholes";
import { Donut, VBars, histogram } from "@/components/quant/charts";
import { CompanyLogo } from "@/components/CompanyLogo";

type SortKey = "sharpe" | "annReturn" | "annVol" | "maxDrawdown" | "beta" | "last" | "totalReturn" | "symbol";

export function Screener() {
  const [data, setData] = useState<UniverseData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [sectors, setSectors] = useState<Set<string>>(new Set());
  const [minSharpe, setMinSharpe] = useState(-1);
  const [maxVol, setMaxVol] = useState(1);
  const [minRet, setMinRet] = useState(-0.5);
  const [maxBeta, setMaxBeta] = useState(3);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "sharpe", dir: -1 });

  useEffect(() => {
    fetch("/api/universe").then((r) => r.json()).then((d) => {
      if (d.error) throw new Error(d.error);
      setData(d); setSelected(d.assets[0]?.symbol ?? null); setState("ready");
    }).catch(() => setState("error"));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toUpperCase();
    const rows = data.assets.filter((a) =>
      (sectors.size === 0 || sectors.has(a.sector)) &&
      a.sharpe >= minSharpe && a.annVol <= maxVol && a.annReturn >= minRet && a.beta <= maxBeta &&
      (q === "" || a.symbol.includes(q) || a.name.toUpperCase().includes(q)));
    const k = sort.key;
    return rows.sort((a, b) => (k === "symbol" ? a.symbol.localeCompare(b.symbol) : (a[k] as number) - (b[k] as number)) * sort.dir);
  }, [data, sectors, minSharpe, maxVol, minRet, maxBeta, query, sort]);

  const dash = useMemo(() => {
    const f = filtered;
    const composition = data ? data.sectors.map((s) => ({ label: s, value: f.filter((a) => a.sector === s).length, color: sectorColor(s) })).filter((x) => x.value > 0) : [];
    return {
      count: f.length,
      avgSharpe: mean(f.map((a) => a.sharpe)),
      avgReturn: mean(f.map((a) => a.annReturn)),
      avgVol: mean(f.map((a) => a.annVol)),
      medBeta: median(f.map((a) => a.beta)),
      avgDD: mean(f.map((a) => a.maxDrawdown)),
      composition,
      sharpeHist: histogram(f.map((a) => a.sharpe), 7, -1, 2.5, (v) => v.toFixed(1), "rgb(var(--green))"),
      retHist: histogram(f.map((a) => a.annReturn), 7, -0.2, 0.7, (v) => `${(v * 100).toFixed(0)}`, "rgb(var(--blue))"),
      volHist: histogram(f.map((a) => a.annVol), 6, 0.1, 0.6, (v) => `${(v * 100).toFixed(0)}`, "rgb(var(--amber))"),
      betaHist: histogram(f.map((a) => a.beta), 6, 0, 2.4, (v) => v.toFixed(1), "rgb(var(--cyan))"),
    };
  }, [filtered, data]);

  const surface = useMemo(() => {
    const rows = [...(filtered.length ? filtered : data?.assets ?? [])].sort((a, b) => a.sector.localeCompare(b.sector));
    const COLS = 30, WIN = 9;
    return rows.map((a) => {
      const s = a.series, rets: number[] = [];
      for (let i = 1; i < s.length; i++) rets.push(s[i] / s[i - 1] - 1);
      const out: number[] = [];
      for (let c = 0; c < COLS; c++) {
        const end = Math.max(WIN, Math.floor((rets.length * (c + 1)) / COLS));
        const w = rets.slice(Math.max(0, end - WIN), end);
        const m = w.reduce((x, y) => x + y, 0) / (w.length || 1);
        const v = Math.sqrt(w.reduce((x, y) => x + (y - m) ** 2, 0) / (w.length || 1)) * Math.sqrt(52);
        out.push(v || 0);
      }
      return out;
    });
  }, [filtered, data]);

  if (state === "loading") return <Loading />;
  if (state === "error" || !data) return <Panel title="Market data"><p className="text-xs text-red">Could not load market data (Yahoo unreachable). Retry shortly.</p></Panel>;

  const sel = data.assets.find((a) => a.symbol === selected) ?? null;
  const toggleSector = (s: string) => setSectors((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const reset = () => { setSectors(new Set()); setMinSharpe(-1); setMaxVol(1); setMinRet(-0.5); setMaxBeta(3); setQuery(""); };
  const th = (key: SortKey, label: string, align = "right") => (
    <th onClick={() => setSort((p) => ({ key, dir: p.key === key ? (p.dir === 1 ? -1 : 1) : -1 }))}
      className={`cursor-pointer select-none ${align === "left" ? "text-left" : "text-right"} hover:text-text`}>
      {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="space-y-3">
      {/* page header */}
      <SectionHead
        title="Equity Screener"
        sub={`US large-cap · ${data.window} · as of ${data.asOf.slice(0, 10)}`}
        right={
          <span className="flex items-center gap-2 text-[12px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-up blink" />
            {data.assets.length} names live
          </span>
        }
      />

      {/* filters */}
      <div className="card space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {data.sectors.map((s) => {
              const on = sectors.has(s) || sectors.size === 0;
              return (
                <button key={s} onClick={() => toggleSector(s)} data-on={on} className="chip">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: sectorColor(s) }} />
                  {s}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol" className="input-field w-40" />
            <button onClick={reset} className="chip">Clear</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-2.5 md:grid-cols-4">
          <Slider label="Min Sharpe" value={minSharpe} min={-1} max={2.5} step={0.1} onChange={setMinSharpe} fmt={(v) => v.toFixed(1)} />
          <Slider label="Max vol" value={maxVol} min={0.1} max={1} step={0.05} onChange={setMaxVol} fmt={(v) => `${(v * 100).toFixed(0)}%`} />
          <Slider label="Min return" value={minRet} min={-0.5} max={1} step={0.05} onChange={setMinRet} fmt={(v) => `${(v * 100).toFixed(0)}%`} />
          <Slider label="Max beta" value={maxBeta} min={0} max={2.5} step={0.1} onChange={setMaxBeta} fmt={(v) => v.toFixed(1)} />
        </div>
      </div>

      {/* metric strip */}
      <MetricBar>
        <Readout label="Screened" value={String(dash.count)} sub={`of ${data.assets.length} names`} />
        <Readout label="Avg Sharpe" value={fmtNumber(dash.avgSharpe)} tone={dash.avgSharpe > 0.8 ? "pos" : "neutral"} sub="risk-adjusted" />
        <Readout label="Avg return" value={fmtPercent(dash.avgReturn, 0)} tone={dash.avgReturn >= 0 ? "pos" : "neg"} sub="annualised" />
        <Readout label="Avg vol" value={fmtPercent(dash.avgVol, 0)} sub="annualised" />
        <Readout label="Median beta" value={fmtNumber(dash.medBeta)} sub="vs SPY" />
        <Readout label="Avg drawdown" value={fmtPercent(dash.avgDD, 0)} tone="neg" sub="peak to trough" />
      </MetricBar>

      {/* leaders */}
      <AnalyticalCards assets={filtered.length ? filtered : data.assets} />

      {/* Composition and sector performance stack beside the 2x2 distribution grid so both
          columns end at about the same height. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.618fr]">
        <Panel title="Sector performance" right="mean annualised return">
          <SectorBars assets={filtered.length ? filtered : data.assets} />
        </Panel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Panel title="Sharpe distribution"><VBars items={dash.sharpeHist} /></Panel>
          <Panel title="Return distribution" right="ann %"><VBars items={dash.retHist} /></Panel>
          <Panel title="Volatility distribution" right="ann %"><VBars items={dash.volHist} /></Panel>
          <Panel title="Beta distribution" right="vs SPY"><VBars items={dash.betaHist} /></Panel>
        </div>
      </div>

      {/* volatility surface */}
      <Panel title="Volatility surface" accent="cyan" right="rolling annualised vol · names × time · drag to rotate">
        {surface.length > 2 ? <Surface3D z={surface} zLabel="ann vol" wide /> : <div className="grid h-40 place-items-center text-xs text-muted">not enough names</div>}
      </Panel>

      {/* The scatter is tall, so the narrow column stacks two cards beside it rather than
          leaving dead space under a single short one. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.618fr_1fr]">
        <Panel title="Risk / return map" accent="green" right="size = Sharpe · sector ellipses">
          <RiskReturnScatter assets={filtered} selected={selected} onSelect={setSelected} />
        </Panel>
        <div className="grid grid-rows-[auto_auto] gap-3">
          <Panel title="Price history" accent="blue" right={sel ? `${sel.symbol} · adjusted close` : ""}>
            {sel ? <PriceChart asset={sel} /> : <div className="grid h-40 place-items-center text-xs text-muted">select an asset</div>}
          </Panel>
          <Panel title="Sector composition" right={`${dash.count} names`}>
            <Donut items={dash.composition} label="names" />
          </Panel>
        </div>
      </div>

      {/* Candlesticks are a primary read on price action, so they get the full width. */}
      {sel && (
        <Panel title="Candlesticks" accent="green" right={`${sel.symbol} · daily OHLC`}>
          <Candlestick asset={sel} wide />
        </Panel>
      )}

      {/* Three compact, similar-height cards. The option surface is wide, so it gets its own
          row below rather than making this row three times taller than its content. */}
      {sel && (
        <>
          {/* Monte Carlo is a headline chart, so it takes the wide slot with the two
              supporting stat panels stacked beside it. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.618fr_1fr]">
            <Panel title="GBM Monte Carlo" accent="blue" right={`${sel.symbol} · 1Y projection · geometric Brownian motion`}>
              <GbmPaths asset={sel} large />
            </Panel>
            <div className="grid grid-rows-[auto_auto] gap-3">
              <Panel title="Return distribution" accent="amber" right="empirical vs Normal"><DistributionPanel asset={sel} /></Panel>
              <Panel title="Option greeks" accent="cyan" right="Black-Scholes"><BlackScholes asset={sel} variant="greeks" /></Panel>
            </div>
          </div>
          <Panel title="Black-Scholes call surface" accent="cyan" right={`${sel.symbol} · value across spot and maturity`}>
            <BlackScholes asset={sel} variant="surface" />
          </Panel>
        </>
      )}

      {/* table */}
      <Panel title="Screen results" accent="cyan" bodyClass="p-0" right={`${filtered.length} names`}>
        <div className="max-h-[440px] overflow-auto">
          <table className="blotter">
            <thead>
              <tr>
                {th("symbol", "Symbol", "left")}<th className="text-left">Sector</th>
                {th("last", "Last")}{th("totalReturn", "3Y")}{th("annReturn", "Ann Ret")}{th("annVol", "Vol")}
                {th("sharpe", "Sharpe")}{th("maxDrawdown", "Max DD")}{th("beta", "Beta")}<th className="text-right">Trend</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.symbol} onClick={() => setSelected(a.symbol)} className={`grid-row cursor-pointer ${a.symbol === selected ? "bg-blue/10" : ""}`}>
                  <td className="text-left">
                    <span className="flex items-center gap-2">
                      <CompanyLogo symbol={a.symbol} name={a.name} sector={a.sector} size={18} />
                      <span className="mono font-semibold text-text">{a.symbol}</span>
                      <span className="truncate text-[11px] text-faint">{a.name}</span>
                    </span>
                  </td>
                  <td className="text-left"><span className="mono text-[10px]" style={{ color: sectorColor(a.sector) }}>{a.sector}</span></td>
                  <td className="text-right mono text-text">{fmtNumber(a.last)}</td>
                  <td className={`text-right mono ${a.totalReturn >= 0 ? "pos" : "neg"}`}>{fmtPercent(a.totalReturn, 0)}</td>
                  <td className={`text-right mono ${a.annReturn >= 0 ? "pos" : "neg"}`}>{fmtPercent(a.annReturn, 0)}</td>
                  <td className="text-right mono text-muted">{fmtPercent(a.annVol, 0)}</td>
                  <td className={`text-right mono font-medium ${a.sharpe > 1 ? "pos" : a.sharpe < 0 ? "neg" : "text-text"}`}>{fmtNumber(a.sharpe)}</td>
                  <td className="text-right mono text-red">{fmtPercent(a.maxDrawdown, 0)}</td>
                  <td className="text-right mono text-muted">{fmtNumber(a.beta)}</td>
                  <td className="text-right"><Spark series={a.series} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.618fr_1fr]">
        <Panel title="Market pulse" accent="green" right="weekly returns by name">
          <MarketHeatmap assets={filtered.length ? filtered : data.assets} />
        </Panel>
        <Panel title="Correlation matrix" accent="blue" right="3Y daily returns, by sector">
          <AssetHeatmap assets={data.assets} ids={data.correlation.ids} matrix={data.correlation.matrix} />
        </Panel>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="t-label">{label}</span>
        <span className="mono text-[12px] font-medium text-text">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full" />
    </div>
  );
}

function Spark({ series }: { series: number[] }) {
  const d = series.length > 24 ? series.filter((_, i) => i % Math.ceil(series.length / 24) === 0) : series;
  if (d.length < 2) return null;
  const lo = Math.min(...d), hi = Math.max(...d), span = hi - lo || 1, W = 60, H = 16;
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * W},${H - ((v - lo) / span) * H}`).join(" ");
  return <svg width={W} height={H} className="inline-block align-middle"><polyline points={pts} fill="none" stroke={d[d.length - 1] >= d[0] ? "rgb(var(--green))" : "rgb(var(--red))"} strokeWidth="1.25" /></svg>;
}

function Loading() {
  return (
    <div className="space-y-2.5">
      <div className="skeleton h-12 rounded" />
      <div className="skeleton h-24 rounded" />
      <div className="panel grid place-items-center py-10"><span className="mono text-[11px] text-muted">pulling real market data from Yahoo Finance...</span></div>
    </div>
  );
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
