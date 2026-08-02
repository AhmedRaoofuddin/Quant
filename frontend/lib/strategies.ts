/**
 * Strategy library.
 *
 * Each strategy is a cross-sectional scoring rule over the live universe. The engine ranks names
 * each rebalance, holds the top N equally weighted, and measures realised returns from actual
 * price history. That produces a genuine gross Sharpe, volatility and turnover per strategy,
 * which then feed the capacity model, the factor attribution and the overfitting firewall.
 *
 * Every rule here is a documented anomaly computable from price and volume alone. That constraint
 * is deliberate and it is a real limitation: without fundamentals there is no book-to-market, no
 * earnings quality and no true size factor. Where a rule stands in for one of those it is named a
 * proxy in its `caveat`, and the UI shows that text. Inventing a "value factor" out of price data
 * and not saying so is how a library like this quietly becomes dishonest.
 *
 * The point of holding many strategies at once is that capacity is strategy-specific and, more
 * importantly, not additive across them: see `portfolio.ts`.
 */

import type { AssetStats } from "./quant-types";
import { analyseCapacity, DEFAULT_ASSUMPTIONS, type CapacityReport, type PositionLiquidity } from "./capacity";
import { annualisedSharpe, mean, std, TRADING_DAYS } from "./stats";

/** Everything a scoring rule may look at. Nothing here extends past the decision point `t`. */
export interface ScoreContext {
  /** Price history up to and including t. */
  hist: number[];
  /** Equal-weighted universe price index up to and including t, for beta and residual rules. */
  market: number[];
  asset: AssetStats;
  /** Index of the current bar within the aligned panel, for seasonality rules. */
  t: number;
  /** Date string of the current bar. */
  date: string;
}

export type StrategyFamily =
  | "momentum" | "reversal" | "volatility" | "trend" | "liquidity" | "seasonality" | "quality";

export interface StrategyDef {
  id: string;
  name: string;
  family: StrategyFamily;
  thesis: string;
  /** Literature the rule comes from. Empty string where it is a generic construction. */
  reference: string;
  /** Stated weakness or approximation. Shown in the UI; never left blank to flatter a rule. */
  caveat: string;
  /** Higher score ranks higher. */
  score: (ctx: ScoreContext) => number;
  rebalanceEvery: number; // in series periods
  holdings: number;
}

// ---------------------------------------------------------------- helpers

/**
 * Price history to compute on: the full daily series when the loader supplied one, otherwise the
 * chart-thinned fallback. Statistics on 260 thinned bars are badly underpowered, so everything
 * analytical reads through these two helpers rather than touching `.series` directly.
 */
export const analyticsCloses = (a: AssetStats): number[] => a.daily?.close ?? a.series;
export const analyticsDates = (a: AssetStats): string[] => a.daily?.dates ?? a.dates;

/** Trailing simple return over `n` periods. */
const ret = (h: number[], n: number) =>
  h.length > n && h[h.length - 1 - n] > 0 ? h[h.length - 1] / h[h.length - 1 - n] - 1 : 0;

/** Period returns over the last `n` bars. */
function rets(h: number[], n: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(1, h.length - n); i < h.length; i++) if (h[i - 1] > 0) out.push(h[i] / h[i - 1] - 1);
  return out;
}

/** Trailing volatility of period returns. Returns 1 when undefined, so it never divides to Infinity. */
function vol(h: number[], n: number): number {
  const r = rets(h, n);
  return r.length > 2 ? std(r) : 1;
}

/** OLS slope and residual series of y on x. Used for beta and residual momentum. */
function regress(y: number[], x: number[]): { beta: number; resid: number[] } {
  const n = Math.min(y.length, x.length);
  if (n < 8) return { beta: 1, resid: [] };
  const ys = y.slice(-n), xs = x.slice(-n);
  const my = mean(ys), mx = mean(xs);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const beta = den > 1e-12 ? num / den : 1;
  const a = my - beta * mx;
  return { beta, resid: ys.map((v, i) => v - (a + beta * xs[i])) };
}

const skew = (r: number[]) => {
  const s = std(r);
  if (!(s > 0) || r.length < 8) return 0;
  const m = mean(r);
  return r.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0) / r.length;
};

// ---------------------------------------------------------------- the library

export const STRATEGIES: StrategyDef[] = [
  // ---- momentum -------------------------------------------------------
  {
    id: "momentum",
    name: "Cross-sectional momentum",
    family: "momentum",
    thesis: "Buy the strongest trailing performers, skipping the most recent period to avoid short-term reversal.",
    reference: "Jegadeesh & Titman (1993)",
    caveat: "Crashes hard when the market rebounds off a bottom; 2009 and 2020 both hurt it.",
    score: (c) => ret(c.hist.slice(0, -1), 60),
    rebalanceEvery: 8,
    holdings: 10,
  },
  {
    id: "quality",
    name: "Risk-adjusted momentum",
    family: "momentum",
    thesis: "Momentum scaled by volatility, so the book is not dominated by the most violent names.",
    reference: "Rachev-style risk-scaled ranking",
    caveat: "Scaling by trailing vol tilts persistently toward low-vol names, so it partly duplicates the low-volatility rule.",
    score: (c) => ret(c.hist.slice(0, -1), 60) / Math.max(vol(c.hist, 60), 1e-4),
    rebalanceEvery: 8,
    holdings: 10,
  },
  {
    id: "residmom",
    name: "Residual momentum",
    family: "momentum",
    thesis: "Momentum measured on returns with market beta stripped out, isolating the name-specific move.",
    reference: "Blitz, Huij & Martens (2011)",
    caveat: "Beta is estimated on a short trailing window, so it is noisy for names with unstable exposure.",
    score: (c) => {
      const r = rets(c.hist, 60), m = rets(c.market, 60);
      const { resid } = regress(r, m);
      if (resid.length < 8) return 0;
      const cut = resid.slice(0, -1);           // skip the most recent bar, as with plain momentum
      const s = std(cut);
      return s > 0 ? mean(cut) / s : 0;
    },
    rebalanceEvery: 8,
    holdings: 10,
  },
  {
    id: "high52",
    name: "Proximity to 52-week high",
    family: "momentum",
    thesis: "Names trading near their one-year high keep drifting up; the high acts as an anchor traders under-react to.",
    reference: "George & Hwang (2004)",
    caveat: "Nearly uncorrelated with plain momentum in theory, heavily correlated with it in practice.",
    score: (c) => {
      const w = c.hist.slice(-252);
      const hi = Math.max(...w);
      return hi > 0 ? c.hist[c.hist.length - 1] / hi : 0;
    },
    rebalanceEvery: 10,
    holdings: 12,
  },

  // ---- reversal -------------------------------------------------------
  {
    id: "reversal",
    name: "Short-term reversal",
    family: "reversal",
    thesis: "Recent losers bounce. High turnover, and the first strategy to be destroyed by trading costs.",
    reference: "Jegadeesh (1990)",
    caveat: "Gross of costs it looks excellent and net of them it usually does not survive. Read its capacity, not its Sharpe.",
    score: (c) => -ret(c.hist, 3),
    rebalanceEvery: 2,
    holdings: 10,
  },
  {
    id: "ltreversal",
    name: "Long-term reversal",
    family: "reversal",
    thesis: "Three-to-five year losers outperform long-run winners as over-extrapolation unwinds.",
    reference: "De Bondt & Thaler (1985)",
    caveat: "Needs a long history, so it is the rule most weakened by this universe's window.",
    score: (c) => -ret(c.hist, Math.min(500, c.hist.length - 2)),
    rebalanceEvery: 40,
    holdings: 12,
  },

  // ---- volatility -----------------------------------------------------
  {
    id: "lowvol",
    name: "Low volatility",
    family: "volatility",
    thesis: "The low-volatility anomaly: calmer names have historically delivered better risk-adjusted returns.",
    reference: "Ang, Hodrick, Xing & Zhang (2006); Blitz & van Vliet (2007)",
    caveat: "A crowded trade since roughly 2015, and it behaves like a bond proxy when rates move sharply.",
    score: (c) => -vol(c.hist, 60),
    rebalanceEvery: 20,
    holdings: 12,
  },
  {
    id: "idiovol",
    name: "Low idiosyncratic volatility",
    family: "volatility",
    thesis: "Low residual volatility after removing market exposure, the sharper form of the low-risk anomaly.",
    reference: "Ang, Hodrick, Xing & Zhang (2006)",
    caveat: "Highly correlated with plain low volatility; the firewall derates them as near-duplicate trials.",
    score: (c) => {
      const { resid } = regress(rets(c.hist, 60), rets(c.market, 60));
      return resid.length > 8 ? -std(resid) : 0;
    },
    rebalanceEvery: 20,
    holdings: 12,
  },
  {
    id: "lowbeta",
    name: "Defensive (low beta)",
    family: "volatility",
    thesis: "Lowest beta to the market. Should show the mildest drawdown and among the highest capacity.",
    reference: "Frazzini & Pedersen (2014), betting against beta",
    caveat: "The published version is levered long-short; this is the unlevered long leg, so returns are far lower.",
    score: (c) => -c.asset.beta,
    rebalanceEvery: 20,
    holdings: 12,
  },
  {
    id: "lottery",
    name: "Anti-lottery (low MAX)",
    family: "volatility",
    thesis: "Avoid names with a huge single-day gain last month; investors overpay for lottery-like payoffs.",
    reference: "Bali, Cakici & Whitelaw (2011)",
    caveat: "On a downsampled series the single-bar maximum is a coarser measure than the daily one in the paper.",
    score: (c) => -Math.max(...rets(c.hist, 21), 0),
    rebalanceEvery: 10,
    holdings: 12,
  },
  {
    id: "skewness",
    name: "Negative skew preference",
    family: "volatility",
    thesis: "Names with left-skewed returns carry a risk premium investors demand compensation to hold.",
    reference: "Harvey & Siddique (2000)",
    caveat: "Skew is noisy on short windows and this uses total rather than co-skewness.",
    score: (c) => -skew(rets(c.hist, 120)),
    rebalanceEvery: 20,
    holdings: 12,
  },

  // ---- trend ----------------------------------------------------------
  {
    id: "trend",
    name: "Trend following",
    family: "trend",
    thesis: "Hold names trading above their own long moving average; a persistence rather than a ranking bet.",
    reference: "Moskowitz, Ooi & Pedersen (2012)",
    caveat: "Whipsaws in range-bound markets, where it pays the turnover without capturing a move.",
    score: (c) => {
      if (c.hist.length < 50) return 0;
      const ma = mean(c.hist.slice(-50));
      return ma > 0 ? c.hist[c.hist.length - 1] / ma - 1 : 0;
    },
    rebalanceEvery: 12,
    holdings: 12,
  },
  {
    id: "macross",
    name: "Moving average crossover",
    family: "trend",
    thesis: "Fast average above slow average, the oldest systematic trend rule there is.",
    reference: "Brock, Lakonishok & LeBaron (1992)",
    caveat: "The most data-mined rule in the book. Treat any strong result here as suspect until the firewall clears it.",
    score: (c) => {
      if (c.hist.length < 100) return 0;
      const fast = mean(c.hist.slice(-20)), slow = mean(c.hist.slice(-100));
      return slow > 0 ? fast / slow - 1 : 0;
    },
    rebalanceEvery: 10,
    holdings: 12,
  },
  {
    id: "breakout",
    name: "Channel breakout",
    family: "trend",
    thesis: "Buy names closing at the top of their recent range, the Donchian rule the Turtles traded.",
    reference: "Donchian (1960); Turtle Trading rules",
    caveat: "Fires late by construction, and the entry is the worst price in the window.",
    score: (c) => {
      const w = c.hist.slice(-55);
      const hi = Math.max(...w), lo = Math.min(...w);
      return hi > lo ? (c.hist[c.hist.length - 1] - lo) / (hi - lo) : 0;
    },
    rebalanceEvery: 8,
    holdings: 10,
  },

  // ---- liquidity ------------------------------------------------------
  {
    id: "illiquidity",
    name: "Amihud illiquidity premium",
    family: "liquidity",
    thesis: "Less liquid names pay a premium for the trading friction their holders accept.",
    reference: "Amihud (2002)",
    caveat: "Directly at odds with capacity: this rule deliberately buys the names the impact model penalises most.",
    score: (c) => {
      const r = rets(c.hist, 60);
      if (!r.length || c.asset.advUsd <= 0) return 0;
      return mean(r.map(Math.abs)) / (c.asset.advUsd / 1e9);
    },
    rebalanceEvery: 20,
    holdings: 12,
  },
  {
    id: "liquid",
    name: "Liquidity tilt",
    family: "liquidity",
    thesis: "The mirror of Amihud: hold only the deepest names. Expect a lower Sharpe and far higher capacity.",
    reference: "Included as the capacity-maximising control",
    caveat: "Not a documented anomaly. It exists to show the capacity ceiling a liquidity-blind rule gives up.",
    score: (c) => Math.log(Math.max(c.asset.advUsd, 1)),
    rebalanceEvery: 40,
    holdings: 12,
  },

  // ---- seasonality ----------------------------------------------------
  {
    id: "turnofmonth",
    name: "Turn of the month",
    family: "seasonality",
    thesis: "Returns cluster around month end; hold high-beta names into the turn and stand down otherwise.",
    reference: "Ariel (1987); Lakonishok & Smidt (1988)",
    caveat: "A calendar effect with no mechanism, widely reported as decayed since publication.",
    score: (c) => {
      const day = Number(c.date.slice(8, 10));
      const nearTurn = day >= 28 || day <= 3;
      return nearTurn ? c.asset.beta : -c.asset.beta;
    },
    rebalanceEvery: 4,
    holdings: 12,
  },

  // ---- quality proxies ------------------------------------------------
  {
    id: "consistency",
    name: "Return consistency",
    family: "quality",
    thesis: "Prefer names that rise on the highest fraction of bars, rather than those with the largest total move.",
    reference: "Hit-rate construction; a price-only stand-in for earnings quality",
    caveat: "A proxy, not a quality factor. Real quality needs fundamentals this universe does not carry.",
    score: (c) => {
      const r = rets(c.hist, 120);
      return r.length ? r.filter((x) => x > 0).length / r.length : 0;
    },
    rebalanceEvery: 20,
    holdings: 12,
  },
  {
    id: "drawdown",
    name: "Shallow drawdown",
    family: "quality",
    thesis: "Hold names furthest above their own trailing peak, favouring uninterrupted compounding.",
    reference: "Generic construction",
    caveat: "Overlaps momentum and trend heavily; it is close to a slower restatement of both.",
    score: (c) => {
      const w = c.hist.slice(-120);
      const peak = Math.max(...w);
      return peak > 0 ? w[w.length - 1] / peak - 1 : 0;
    },
    rebalanceEvery: 12,
    holdings: 12,
  },
  {
    id: "dipbuy",
    name: "Drawdown recovery",
    family: "reversal",
    thesis: "The opposite bet: buy names furthest below their trailing peak, expecting mean reversion.",
    reference: "Generic construction",
    caveat: "Structurally short momentum, so it is the natural hedge to half this library and loses when trends persist.",
    score: (c) => {
      const w = c.hist.slice(-120);
      const peak = Math.max(...w);
      return peak > 0 ? -(w[w.length - 1] / peak - 1) : 0;
    },
    rebalanceEvery: 10,
    holdings: 10,
  },
];

export interface StrategyResult {
  id: string;
  name: string;
  family: StrategyFamily;
  thesis: string;
  reference: string;
  caveat: string;
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
  /** Weight per symbol at the final rebalance, for the joint-capacity optimiser. */
  weights: Record<string, number>;
  capacity: CapacityReport;
}

/** Equal-weighted price index of the usable universe, the market proxy for beta and residuals. */
function marketIndex(usable: AssetStats[], T: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < T; t++) {
    let acc = 0, n = 0;
    for (const a of usable) {
      const s = analyticsCloses(a).slice(-T);
      if (s[t] > 0 && s[0] > 0) { acc += s[t] / s[0]; n++; }
    }
    out.push(n ? acc / n : 1);
  }
  return out;
}

/**
 * Walk the price panel forward, rebalancing on schedule. Scores at time t use only data up to t,
 * and the return earned is from t to t+1, so there is no look-ahead.
 */
export function runStrategy(def: StrategyDef, assets: AssetStats[], market?: number[]): StrategyResult | null {
  const usable = assets.filter((a) => analyticsCloses(a).length > 60 && a.advUsd > 0);
  if (usable.length < def.holdings + 2) return null;

  const T = Math.min(...usable.map((a) => analyticsCloses(a).length));
  const dates = analyticsDates(usable[0]).slice(-T);
  const mkt = market ?? marketIndex(usable, T);
  const start = 60;

  // Slice each series once rather than inside the inner loop: this runs 20 strategies x ~700 bars.
  const panel = new Map(usable.map((a) => [a.symbol, analyticsCloses(a).slice(-T)]));

  let held: string[] = [];
  const periodReturns: number[] = [];
  const retDates: string[] = [];
  let turnoverEvents = 0, turnoverSum = 0;

  for (let t = start; t < T - 1; t++) {
    if ((t - start) % def.rebalanceEvery === 0) {
      const ranked = usable
        .map((a) => ({
          sym: a.symbol,
          s: def.score({
            hist: panel.get(a.symbol)!.slice(0, t + 1),
            market: mkt.slice(0, t + 1),
            asset: a,
            t,
            date: dates[t],
          }),
        }))
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
      const s = panel.get(sym);
      if (!s) continue;
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
  const weights: Record<string, number> = {};
  for (const sym of held) weights[sym] = 1 / held.length;

  const capacity = analyseCapacity(book, {
    ...DEFAULT_ASSUMPTIONS,
    grossAnnReturn, annVol: Math.max(annVol, 1e-4), annualTurnover,
  });

  return {
    id: def.id, name: def.name, family: def.family, thesis: def.thesis,
    reference: def.reference, caveat: def.caveat,
    holdings: def.holdings, rebalanceEvery: def.rebalanceEvery,
    grossAnnReturn, annVol, grossSharpe, maxDrawdown: mdd, annualTurnover,
    periodReturns, equity, dates: retDates, book, weights, capacity,
  };
}

export function runAllStrategies(assets: AssetStats[]): StrategyResult[] {
  const usable = assets.filter((a) => analyticsCloses(a).length > 60 && a.advUsd > 0);
  if (!usable.length) return [];
  const T = Math.min(...usable.map((a) => analyticsCloses(a).length));
  const mkt = marketIndex(usable, T);   // computed once, shared by every strategy
  return STRATEGIES.map((d) => runStrategy(d, assets, mkt)).filter((r): r is StrategyResult => r !== null);
}
