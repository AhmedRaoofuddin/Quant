/**
 * Real market data layer. Pulls daily OHLCV from Yahoo Finance's keyless chart API for a curated
 * multi-sector universe, then computes the analytics a research desk actually screens on:
 * annualised return and volatility, Sharpe, max drawdown, beta to the market, and the full
 * cross-asset return correlation matrix. Results are cached in memory and on disk so the terminal
 * is fast after the first load.
 */

import fs from "node:fs";
import path from "node:path";
import type { AssetStats, UniverseData } from "./quant-types";

export type { AssetStats, UniverseData } from "./quant-types";

export type { UniverseMember } from "./universe";
export { UNIVERSE, universeMember } from "./universe";

import { UNIVERSE } from "./universe";

const BENCHMARK = "SPY";
const TD = 252;

interface Series { dates: string[]; open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }

async function fetchYahoo(symbol: string, range = "3y"): Promise<Series | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0] ?? {};
    const closes: (number | null)[] = q.close ?? [];
    const opens: (number | null)[] = q.open ?? [];
    const highs: (number | null)[] = q.high ?? [];
    const lows: (number | null)[] = q.low ?? [];
    const vols: (number | null)[] = q.volume ?? [];
    if (!ts.length || !closes.length) return null;
    const dates: string[] = [], open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null) continue;
      dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
      close.push(closes[i] as number);
      open.push((opens[i] ?? closes[i]) as number);
      high.push((highs[i] ?? closes[i]) as number);
      low.push((lows[i] ?? closes[i]) as number);
      volume.push((vols[i] ?? 0) as number);
    }
    return close.length > 30 ? { dates, open, high, low, close, volume } : null;
  } catch {
    return null;
  }
}

function dailyReturns(close: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < close.length; i++) r.push(close[i] / close[i - 1] - 1);
  return r;
}
function mean(a: number[]) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function std(a: number[]) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
function maxDD(close: number[]) { let peak = close[0] ?? 1, dd = 0; for (const p of close) { peak = Math.max(peak, p); dd = Math.min(dd, p / peak - 1); } return dd; }

/** Median daily traded value over the last quarter. Median resists earnings-day volume spikes. */
function advUsd(s: Series): number {
  const n = Math.min(63, s.close.length);
  const vals: number[] = [];
  for (let i = s.close.length - n; i < s.close.length; i++) {
    const v = s.close[i] * (s.volume[i] ?? 0);
    if (v > 0) vals.push(v);
  }
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/**
 * Spread proxy from daily high-low ranges (the intuition behind Corwin-Schultz): the intraday
 * range embeds the spread, so a small fraction of the average range estimates it when quote data
 * is unavailable.
 *
 * The coefficient is calibrated to observed US large-cap quoted spreads, which sit around
 * 1-2bp for the most liquid names and rarely exceed ~15bp in this universe. A stock with a 4%
 * daily range therefore lands near 2bp rather than the tens of bps a naive fraction of the range
 * would imply. Clamped to a plausible band so a single wide day cannot distort the capacity model.
 */
function spreadBps(s: Series): number {
  const n = Math.min(63, s.close.length);
  const ranges: number[] = [];
  for (let i = s.close.length - n; i < s.close.length; i++) {
    const mid = s.close[i];
    if (mid > 0 && s.high[i] > 0 && s.low[i] > 0) ranges.push((s.high[i] - s.low[i]) / mid);
  }
  if (!ranges.length) return 2;
  ranges.sort((a, b) => a - b);
  const medianRange = ranges[Math.floor(ranges.length / 2)];  // median resists gap days
  return Math.min(20, Math.max(0.4, medianRange * 0.005 * 1e4));
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

const CACHE_TTL_MS = 30 * 60 * 1000;
let memCache: { at: number; data: UniverseData } | null = null;

function diskPath() { return path.join(process.cwd(), ".cache", "universe.json"); }
function readDisk(): { at: number; data: UniverseData } | null {
  try { return JSON.parse(fs.readFileSync(diskPath(), "utf8")); } catch { return null; }
}
function writeDisk(payload: { at: number; data: UniverseData }) {
  try { fs.mkdirSync(path.dirname(diskPath()), { recursive: true }); fs.writeFileSync(diskPath(), JSON.stringify(payload)); } catch { /* ignore */ }
}

export async function getUniverse(force = false): Promise<UniverseData> {
  const now = Date.now();
  if (!force && memCache && now - memCache.at < CACHE_TTL_MS) return memCache.data;
  if (!force) { const d = readDisk(); if (d && now - d.at < CACHE_TTL_MS) { memCache = d; return d.data; } }

  const bench = await fetchYahoo(BENCHMARK);
  const benchRet = bench ? dailyReturns(bench.close) : [];
  const benchVar = std(benchRet) ** 2;
  const benchByDate = new Map<string, number>();
  if (bench) bench.dates.slice(1).forEach((d, i) => benchByDate.set(d, benchRet[i]));

  const series = await pool(UNIVERSE, 8, async (m) => ({ m, s: await fetchYahoo(m.symbol) }));

  const assets: AssetStats[] = [];
  const retByAsset: Record<string, Map<string, number>> = {};
  for (const { m, s } of series) {
    if (!s) continue;
    const rets = dailyReturns(s.close);
    const retDates = s.dates.slice(1);
    const map = new Map<string, number>();
    retDates.forEach((d, i) => map.set(d, rets[i]));
    retByAsset[m.symbol] = map;

    // Beta vs benchmark on overlapping dates.
    let cov = 0, n = 0;
    const bm = mean(benchRet), am = mean(rets);
    retDates.forEach((d, i) => { const b = benchByDate.get(d); if (b !== undefined) { cov += (rets[i] - am) * (b - bm); n++; } });
    const beta = benchVar > 0 && n > 1 ? cov / (n - 1) / benchVar : 1;

    const ds = downsample(s.dates.map((d, i) => ({ d, c: s.close[i] })), 260);
    const bars = downsample(s.dates.map((d, i) => ({ d, o: s.open[i], h: s.high[i], l: s.low[i], c: s.close[i] })), 130);
    assets.push({
      symbol: m.symbol, name: m.name, sector: m.sector,
      last: s.close[s.close.length - 1],
      totalReturn: s.close[s.close.length - 1] / s.close[0] - 1,
      annReturn: mean(rets) * TD,
      annVol: std(rets) * Math.sqrt(TD),
      sharpe: std(rets) > 0 ? (mean(rets) * TD) / (std(rets) * Math.sqrt(TD)) : 0,
      maxDrawdown: maxDD(s.close),
      beta,
      series: ds.map((x) => x.c),
      dates: ds.map((x) => x.d),
      daily: { dates: s.dates, close: s.close },
      ohlc: bars,
      advUsd: advUsd(s),
      spreadBps: spreadBps(s),
    });
  }

  // Correlation matrix on the common date set.
  const ids = assets.map((a) => a.symbol);
  const common = intersectionDates(ids.map((id) => retByAsset[id]));
  const matrix = correlation(ids, retByAsset, common);

  const data: UniverseData = {
    asOf: new Date().toISOString(),
    window: "3y daily",
    assets: assets.sort((a, b) => b.sharpe - a.sharpe),
    sectors: [...new Set(UNIVERSE.map((m) => m.sector))].sort(),
    correlation: { ids, matrix },
    benchmarkReturn: bench ? bench.close[bench.close.length - 1] / bench.close[0] - 1 : 0,
  };
  memCache = { at: now, data };
  writeDisk(memCache);
  return data;
}

function intersectionDates(maps: Map<string, number>[]): string[] {
  if (!maps.length) return [];
  const counts = new Map<string, number>();
  for (const m of maps) for (const d of m.keys()) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()].filter(([, c]) => c === maps.length).map(([d]) => d).sort();
}

function correlation(ids: string[], byAsset: Record<string, Map<string, number>>, dates: string[]): number[][] {
  const cols = ids.map((id) => dates.map((d) => byAsset[id].get(d) ?? 0));
  const n = ids.length;
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const m = cols.map((c) => mean(c));
  const sd = cols.map((c) => std(c));
  for (let a = 0; a < n; a++) for (let b = a; b < n; b++) {
    let cov = 0;
    for (let i = 0; i < dates.length; i++) cov += (cols[a][i] - m[a]) * (cols[b][i] - m[b]);
    cov /= Math.max(1, dates.length - 1);
    const r = sd[a] > 0 && sd[b] > 0 ? cov / (sd[a] * sd[b]) : a === b ? 1 : 0;
    out[a][b] = r; out[b][a] = r;
  }
  return out;
}
