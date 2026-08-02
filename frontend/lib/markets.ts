/**
 * Cross-asset market data layer.
 *
 * Sources, all public and keyless:
 *   - Yahoo Finance chart API  : indices, sector ETFs, commodities, FX, crypto, rates
 *   - FRED (St. Louis Fed) CSV : macro series (CPI, unemployment, fed funds, 10Y)
 *
 * Everything is fetched concurrently, cached in memory and on disk, and reduced to the
 * summary statistics the terminal needs.
 */

import fs from "node:fs";
import path from "node:path";

export interface Instrument {
  symbol: string;
  name: string;
  group: "Index" | "Sector" | "Commodity" | "FX" | "Crypto" | "Rates";
  last: number;
  chg1d: number;
  chg1m: number;
  chg1y: number;
  annVol: number;
  series: number[];
  dates: string[];
}

export interface MacroSeries {
  id: string;
  name: string;
  unit: string;
  last: number;
  prev: number;
  dates: string[];
  values: number[];
}

export interface MarketsData {
  asOf: string;
  instruments: Instrument[];
  macro: MacroSeries[];
}

const CATALOG: { symbol: string; name: string; group: Instrument["group"] }[] = [
  // Indices
  { symbol: "^GSPC", name: "S&P 500", group: "Index" },
  { symbol: "^DJI", name: "Dow Jones", group: "Index" },
  { symbol: "^IXIC", name: "Nasdaq Composite", group: "Index" },
  { symbol: "^RUT", name: "Russell 2000", group: "Index" },
  { symbol: "^VIX", name: "VIX Volatility", group: "Index" },
  { symbol: "^FTSE", name: "FTSE 100", group: "Index" },
  { symbol: "^N225", name: "Nikkei 225", group: "Index" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", group: "Index" },
  // SPDR sector ETFs
  { symbol: "XLK", name: "Technology", group: "Sector" },
  { symbol: "XLF", name: "Financials", group: "Sector" },
  { symbol: "XLV", name: "Health Care", group: "Sector" },
  { symbol: "XLE", name: "Energy", group: "Sector" },
  { symbol: "XLY", name: "Consumer Disc.", group: "Sector" },
  { symbol: "XLP", name: "Consumer Staples", group: "Sector" },
  { symbol: "XLI", name: "Industrials", group: "Sector" },
  { symbol: "XLC", name: "Communications", group: "Sector" },
  { symbol: "XLU", name: "Utilities", group: "Sector" },
  { symbol: "XLRE", name: "Real Estate", group: "Sector" },
  { symbol: "XLB", name: "Materials", group: "Sector" },
  // Commodities
  { symbol: "GC=F", name: "Gold", group: "Commodity" },
  { symbol: "SI=F", name: "Silver", group: "Commodity" },
  { symbol: "CL=F", name: "Crude Oil WTI", group: "Commodity" },
  { symbol: "BZ=F", name: "Brent Crude", group: "Commodity" },
  { symbol: "NG=F", name: "Natural Gas", group: "Commodity" },
  { symbol: "HG=F", name: "Copper", group: "Commodity" },
  // FX
  { symbol: "DX-Y.NYB", name: "US Dollar Index", group: "FX" },
  { symbol: "EURUSD=X", name: "EUR / USD", group: "FX" },
  { symbol: "GBPUSD=X", name: "GBP / USD", group: "FX" },
  { symbol: "JPY=X", name: "USD / JPY", group: "FX" },
  { symbol: "AEDUSD=X", name: "AED / USD", group: "FX" },
  // Crypto
  { symbol: "BTC-USD", name: "Bitcoin", group: "Crypto" },
  { symbol: "ETH-USD", name: "Ethereum", group: "Crypto" },
  // Rates
  { symbol: "^IRX", name: "US 13-Week Bill", group: "Rates" },
  { symbol: "^FVX", name: "US 5-Year", group: "Rates" },
  { symbol: "^TNX", name: "US 10-Year", group: "Rates" },
  { symbol: "^TYX", name: "US 30-Year", group: "Rates" },
];

const FRED_SERIES: { id: string; name: string; unit: string }[] = [
  { id: "CPIAUCSL", name: "CPI (All Items)", unit: "index" },
  { id: "UNRATE", name: "Unemployment Rate", unit: "%" },
  { id: "FEDFUNDS", name: "Fed Funds Rate", unit: "%" },
  { id: "DGS10", name: "10-Year Treasury", unit: "%" },
  { id: "T10Y2Y", name: "10Y-2Y Spread", unit: "%" },
  { id: "VIXCLS", name: "VIX (FRED)", unit: "index" },
];

const UA = { "user-agent": "Mozilla/5.0" };
const TD = 252;

async function fetchChart(symbol: string, range = "2y"): Promise<{ dates: string[]; close: number[] } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const dates: string[] = [], close: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null) continue;
      dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
      close.push(closes[i] as number);
    }
    return close.length > 20 ? { dates, close } : null;
  } catch {
    return null;
  }
}

async function fetchFred(id: string): Promise<{ dates: string[]; values: number[] } | null> {
  try {
    const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, {
      headers: UA, signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    const lines = text.trim().split("\n").slice(1);
    const dates: string[] = [], values: number[] = [];
    for (const line of lines) {
      const [d, v] = line.split(",");
      const n = parseFloat(v);
      if (!d || Number.isNaN(n)) continue;
      dates.push(d.trim());
      values.push(n);
    }
    // Keep the last ~15 years so charts stay readable.
    const keep = 190;
    return { dates: dates.slice(-keep), values: values.slice(-keep) };
  } catch {
    return null;
  }
}

function pctChange(series: number[], back: number): number {
  if (series.length < 2) return 0;
  const i = Math.max(0, series.length - 1 - back);
  const a = series[i], b = series[series.length - 1];
  return a ? b / a - 1 : 0;
}

function annVol(series: number[]): number {
  const r: number[] = [];
  for (let i = 1; i < series.length; i++) if (series[i - 1]) r.push(series[i] / series[i - 1] - 1);
  if (r.length < 2) return 0;
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(TD);
}

function downsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n, out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  out[out.length - 1] = arr[arr.length - 1];
  return out;
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

const TTL = 30 * 60 * 1000;
let mem: { at: number; data: MarketsData } | null = null;
const diskPath = () => path.join(process.cwd(), ".cache", "markets.json");

export async function getMarkets(force = false): Promise<MarketsData> {
  const now = Date.now();
  if (!force && mem && now - mem.at < TTL) return mem.data;
  if (!force) {
    try {
      const d = JSON.parse(fs.readFileSync(diskPath(), "utf8"));
      if (now - d.at < TTL) { mem = d; return d.data; }
    } catch { /* cold cache */ }
  }

  const [charts, fred] = await Promise.all([
    pool(CATALOG, 8, async (c) => ({ c, s: await fetchChart(c.symbol) })),
    pool(FRED_SERIES, 3, async (f) => ({ f, s: await fetchFred(f.id) })),
  ]);

  const instruments: Instrument[] = [];
  for (const { c, s } of charts) {
    if (!s) continue;
    const ds = downsample(s.dates.map((d, i) => ({ d, c: s.close[i] })), 180);
    instruments.push({
      symbol: c.symbol, name: c.name, group: c.group,
      last: s.close[s.close.length - 1],
      chg1d: pctChange(s.close, 1),
      chg1m: pctChange(s.close, 21),
      chg1y: pctChange(s.close, 252),
      annVol: annVol(s.close),
      series: ds.map((x) => x.c),
      dates: ds.map((x) => x.d),
    });
  }

  const macro: MacroSeries[] = [];
  for (const { f, s } of fred) {
    if (!s || s.values.length < 2) continue;
    macro.push({
      id: f.id, name: f.name, unit: f.unit,
      last: s.values[s.values.length - 1],
      prev: s.values[s.values.length - 2],
      dates: s.dates, values: s.values,
    });
  }

  const data: MarketsData = { asOf: new Date().toISOString(), instruments, macro };
  mem = { at: now, data };
  try {
    fs.mkdirSync(path.dirname(diskPath()), { recursive: true });
    fs.writeFileSync(diskPath(), JSON.stringify(mem));
  } catch { /* cache is best-effort */ }
  return data;
}
