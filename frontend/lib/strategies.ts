/**
 * Strategy library.
 *
 * Each strategy is a cross-sectional scoring rule over the live universe. The engine ranks names
 * each rebalance, holds the top N equally weighted, and measures realised returns from actual
 * price history. That produces a genuine gross Sharpe, volatility and turnover per strategy,
 * which then feed the capacity model and the overfitting firewall.
 *
 * The point of holding several strategies at once is that capacity is strategy-specific: a
 * low-volatility book in mega caps carries far more capital than a short-horizon reversal book
 * that churns every period.
 */

import type { AssetStats } from "./quant-types";
import { analyseCapacity, DEFAULT_ASSUMPTIONS, type CapacityReport, type PositionLiquidity } from "./capacity";
import { annualisedSharpe, mean, std, TRADING_DAYS } from "./stats";

export interface StrategyDef {
  id: string;
  name: string;
  thesis: string;
  /** Higher score ranks higher. `hist` is the price series up to and including `t`. */
  score: (hist: number[], asset: AssetStats) => number;
  rebalanceEvery: number; // in series periods
  holdings: number;
}

/** Trailing return over `n` periods. */
const ret = (h: number[], n: number) => (h.length > n && h[h.length - 1 - n] > 0 ? h[h.length - 1] / h[h.length - 1 - n] - 1 : 0);

/** Trailing volatility of period returns. */
function vol(h: number[], n: number): number {
  const r: number[] = [];
  for (let i = Math.max(1, h.length - n); i < h.length; i++) if (h[i - 1] > 0) r.push(h[i] / h[i - 1] - 1);
  return r.length > 2 ? std(r) : 1;
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: "momentum",
    name: "Cross-sectional momentum",
    thesis: "Buy the strongest trailing performers, skipping the most recent period to avoid short-term reversal.",
    score: (h) => ret(h.slice(0, -1), 60),
    rebalanceEvery: 8,
    holdings: 10,
  },
  {
    id: "lowvol",
    name: "Low volatility",
    thesis: "The low-volatility anomaly: calmer names have historically delivered better risk-adjusted returns.",
    score: (h) => -vol(h, 60),
    rebalanceEvery: 20,
    holdings: 12,
  },
  {
    id: "reversal",
    name: "Short-term reversal",
    thesis: "Recent losers bounce. High turnover, and the first strategy to be destroyed by trading costs.",
    score: (h) => -ret(h, 3),
    rebalanceEvery: 2,
    holdings: 10,
  },
  {
    id: "trend",
    name: "Trend following",
    thesis: "Hold names trading above their own long moving average; a persistence rather than a ranking bet.",
    score: (h) => {
      if (h.length < 50) return 0;
      const ma = mean(h.slice(-50));
      return ma > 0 ? h[h.length - 1] / ma - 1 : 0;
    },
    rebalanceEvery: 12,
    holdings: 12,
  },
  {
    id: "quality",
    name: "Risk-adjusted momentum",
    thesis: "Momentum scaled by volatility, so the book is not dominated by the most violent names.",
    score: (h) => ret(h.slice(0, -1), 60) / Math.max(vol(h, 60), 1e-4),
    rebalanceEvery: 8,
    holdings: 10,
  },
  {
    id: "lowbeta",
    name: "Defensive (low beta)",
    thesis: "Lowest beta to the market. Should show the mildest drawdown and the highest capacity.",
    score: (_h, a) => -a.beta,
    rebalanceEvery: 20,
    holdings: 12,
  },
];

export interface StrategyResult {
  id: string;
  name: string;
  thesis: string;
  holdings: number;
  rebalanceEvery: number;
  grossAnnReturn: number;
  annVol: number;
  grossSharpe: number;
  maxDrawdown: number;
  annualTurnover: number;
  periodReturns: number[];
  equity: number[];
  dates: string[];
  book: PositionLiquidity[];
  capacity: CapacityReport;
}

/**
 * Walk the price panel forward, rebalancing on schedule. Scores at time t use only data up to t,
 * and the return earned is from t to t+1, so there is no look-ahead.
 */
export function runStrategy(def: StrategyDef, assets: AssetStats[]): StrategyResult | null {
  const usable = assets.filter((a) => a.series.length > 60 && a.advUsd > 0);
  if (usable.length < def.holdings + 2) return null;

  const T = Math.min(...usable.map((a) => a.series.length));
  const dates = usable[0].dates.slice(-T);
  const start = 60;

  let held: string[] = [];
  const periodReturns: number[] = [];
  const retDates: string[] = [];
  let turnoverEvents = 0, turnoverSum = 0;

  for (let t = start; t < T - 1; t++) {
    if ((t - start) % def.rebalanceEvery === 0) {
      const ranked = usable
        .map((a) => ({ sym: a.symbol, s: def.score(a.series.slice(0, t + 1), a) }))
        .filter((x) => Number.isFinite(x.s))
        .sort((x, y) => y.s - x.s)
        .slice(0, def.holdings)
        .map((x) => x.sym);

      if (held.length) {
        const kept = ranked.filter((s) => held.includes(s)).length;
        turnoverSum += 1 - kept / def.holdings;  // fraction of book replaced
        turnoverEvents++;
      }
      held = ranked;
    }
    if (!held.length) continue;

    // Equally weighted return from t to t+1.
    let acc = 0, n = 0;
    for (const sym of held) {
      const a = usable.find((x) => x.symbol === sym);
      if (!a) continue;
      const s = a.series.slice(-T);
      if (s[t] > 0 && s[t + 1] > 0) { acc += s[t + 1] / s[t] - 1; n++; }
    }
    if (n) { periodReturns.push(acc / n); retDates.push(dates[t + 1]); }
  }

  if (periodReturns.length < 20) return null;

  // The series is downsampled, so infer how many periods make a year.
  const periodsPerYear = TRADING_DAYS / Math.max(1, Math.round(756 / T));
  const grossAnnReturn = mean(periodReturns) * periodsPerYear;
  const annVol = std(periodReturns) * Math.sqrt(periodsPerYear);
  const grossSharpe = annualisedSharpe(periodReturns, periodsPerYear);

  const equity: number[] = [];
  let cum = 1, peak = 1, mdd = 0;
  for (const r of periodReturns) {
    cum *= 1 + r; equity.push(cum);
    peak = Math.max(peak, cum); mdd = Math.min(mdd, cum / peak - 1);
  }

  const rebalancesPerYear = periodsPerYear / def.rebalanceEvery;
  const avgTurnover = turnoverEvents ? turnoverSum / turnoverEvents : 1;
  const annualTurnover = Math.max(0.5, rebalancesPerYear * avgTurnover);

  const book: PositionLiquidity[] = held.map((sym) => {
    const a = usable.find((x) => x.symbol === sym)!;
    return { symbol: sym, weight: 1, advUsd: a.advUsd, dailyVol: a.annVol / Math.sqrt(TRADING_DAYS), spreadBps: a.spreadBps };
  });

  const capacity = analyseCapacity(book, {
    ...DEFAULT_ASSUMPTIONS,
    grossAnnReturn, annVol: Math.max(annVol, 1e-4), annualTurnover,
  });

  return {
    id: def.id, name: def.name, thesis: def.thesis,
    holdings: def.holdings, rebalanceEvery: def.rebalanceEvery,
    grossAnnReturn, annVol, grossSharpe, maxDrawdown: mdd, annualTurnover,
    periodReturns, equity, dates: retDates, book, capacity,
  };
}

export function runAllStrategies(assets: AssetStats[]): StrategyResult[] {
  return STRATEGIES.map((d) => runStrategy(d, assets)).filter((r): r is StrategyResult => r !== null);
}
