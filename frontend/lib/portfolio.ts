/**
 * Joint capacity: what a book of strategies can carry when run together.
 *
 * Single-strategy capacity is the easy half of the question. The hard half is that capacity does
 * not add up. Two strategies that both hold NVDA are competing for the same daily volume, so the
 * combined book hits the participation cap sooner than either one alone would suggest. Summing
 * per-strategy capacities is the standard mistake, and it overstates what a multi-strategy fund
 * can actually deploy.
 *
 * This module measures the gap. It computes:
 *
 *   1. the naive sum of individual deployable capacities,
 *   2. the true joint capacity of the blended book, where overlapping names share liquidity,
 *   3. the difference between them, the overlap tax,
 *   4. an allocation across strategies that maximises net Sharpe after impact.
 *
 * The optimiser is deliberately simple and explained inline. It is not trying to be a
 * production risk system; it is trying to be a correct and legible one.
 */

import { DEFAULT_ASSUMPTIONS, type CapacityAssumptions, type PositionLiquidity } from "./capacity";
import { mean, std, TRADING_DAYS } from "./stats";

export interface StrategyInput {
  id: string;
  name: string;
  /** Target weight per symbol at the latest rebalance. Should sum to about 1. */
  weights: Record<string, number>;
  /** Aligned period returns, gross of costs. */
  returns: number[];
  grossAnnReturn: number;
  annVol: number;
  annualTurnover: number;
  deployableCapacity: number;
}

export interface NameLiquidity {
  advUsd: number;
  dailyVol: number;
  spreadBps: number;
}

export interface JointPoint {
  aumUsd: number;
  costBps: number;
  netAnnReturn: number;
  netSharpe: number;
  worstParticipation: number;
  bindingSymbol: string;
  breaches: boolean;
}

export interface OverlapPair {
  a: string;
  b: string;
  /** Fraction of book weight held in common, 0 to 1. */
  overlap: number;
  /** Correlation of the two return series. */
  correlation: number;
}

export interface PortfolioReport {
  allocation: { id: string; name: string; weight: number }[];
  curve: JointPoint[];
  /** Sum of each strategy's own deployable capacity. The number people quote, and it is wrong. */
  naiveSumCapacity: number;
  /** What the blended book can actually carry. */
  jointCapacity: number;
  /** 1 - joint / naive. How much capacity the overlap destroys. */
  overlapTax: number;
  blendedGrossReturn: number;
  blendedVol: number;
  blendedSharpe: number;
  /** Sharpe of an equal-weight blend, as the baseline the optimiser has to beat. */
  equalWeightSharpe: number;
  /** Weighted-average pairwise correlation of the allocated strategies. */
  avgCorrelation: number;
  diversificationRatio: number;
  topOverlaps: OverlapPair[];
  bindingSymbol: string;
  nameCount: number;
  sweepMaxAum: number;
  jointCapacityUnbounded: boolean;
}

// ---------------------------------------------------------------- linear algebra

function covariance(series: number[][]): number[][] {
  const n = series.length;
  const T = Math.min(...series.map((s) => s.length));
  const trimmed = series.map((s) => s.slice(-T));
  const mus = trimmed.map(mean);
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let acc = 0;
      for (let t = 0; t < T; t++) acc += (trimmed[i][t] - mus[i]) * (trimmed[j][t] - mus[j]);
      const v = T > 1 ? acc / (T - 1) : 0;
      cov[i][j] = v; cov[j][i] = v;
    }
  }
  return cov;
}

function correlation(a: number[], b: number[]): number {
  const T = Math.min(a.length, b.length);
  if (T < 8) return 0;
  const x = a.slice(-T), y = b.slice(-T);
  const sx = std(x), sy = std(y);
  if (!(sx > 0) || !(sy > 0)) return 0;
  const mx = mean(x), my = mean(y);
  let acc = 0;
  for (let t = 0; t < T; t++) acc += (x[t] - mx) * (y[t] - my);
  return acc / ((T - 1) * sx * sy);
}

/** Portfolio weight per symbol when strategies are blended at `w`. */
function blendBook(strategies: StrategyInput[], w: number[]): Record<string, number> {
  const book: Record<string, number> = {};
  strategies.forEach((s, i) => {
    if (w[i] <= 0) return;
    for (const [sym, sw] of Object.entries(s.weights)) {
      book[sym] = (book[sym] ?? 0) + w[i] * sw;
    }
  });
  return book;
}

// ---------------------------------------------------------------- allocation

/**
 * Long-only maximum-Sharpe weights by projected gradient ascent.
 *
 * A closed-form tangency portfolio needs an unconstrained short leg and an invertible covariance
 * matrix, and with 20 correlated strategies on a few hundred observations that inverse is close to
 * meaningless. Gradient ascent on the simplex avoids the inversion entirely, respects long-only,
 * and converges in well under a second at this size. Covariance is shrunk toward its diagonal
 * (Ledoit-Wolf in spirit, fixed intensity) because sample correlations at this sample length are
 * biased toward extremes.
 */
function maxSharpeWeights(mu: number[], cov: number[][], shrink = 0.25): number[] {
  const n = mu.length;
  if (n === 1) return [1];

  const S = cov.map((row, i) => row.map((v, j) => (i === j ? v : v * (1 - shrink))));

  let w = new Array(n).fill(1 / n);
  const project = (v: number[]) => {
    // Project onto the simplex: clip negatives, renormalise. Enough for a long-only budget.
    const clipped = v.map((x) => Math.max(0, x));
    const sum = clipped.reduce((a, b) => a + b, 0);
    return sum > 1e-12 ? clipped.map((x) => x / sum) : new Array(n).fill(1 / n);
  };

  const sharpeOf = (v: number[]) => {
    const r = v.reduce((a, x, i) => a + x * mu[i], 0);
    let varr = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) varr += v[i] * v[j] * S[i][j];
    return varr > 1e-18 ? r / Math.sqrt(varr) : 0;
  };

  let step = 0.35;
  let best = sharpeOf(w), bestW = w.slice();
  for (let iter = 0; iter < 600; iter++) {
    const r = w.reduce((a, x, i) => a + x * mu[i], 0);
    const Sw = w.map((_, i) => w.reduce((a, x, j) => a + x * S[i][j], 0));
    let varr = 0;
    for (let i = 0; i < n; i++) varr += w[i] * Sw[i];
    const sd = Math.sqrt(Math.max(varr, 1e-18));

    // d/dw of (mu'w) / sqrt(w'Sw)
    const grad = mu.map((m, i) => (m * sd - (r * Sw[i]) / sd) / (sd * sd));
    const next = project(w.map((x, i) => x + step * grad[i]));
    const s = sharpeOf(next);
    if (s > best) { best = s; bestW = next.slice(); w = next; }
    else { step *= 0.85; w = next; }
    if (step < 1e-5) break;
  }
  return bestW;
}

// ---------------------------------------------------------------- joint capacity

/**
 * Round-trip cost of the blended book at a given AUM, plus which name is closest to its cap.
 *
 * This is where overlap bites: `book[sym]` already aggregates the same name across every strategy
 * holding it, so a name two strategies both want carries both positions against one ADV.
 */
function costOf(
  book: Record<string, number>,
  liquidity: Record<string, NameLiquidity>,
  aum: number,
  a: CapacityAssumptions,
) {
  let cost = 0, worst = 0, bindingSymbol = "", breaches = false;
  const gross = Object.values(book).reduce((s, v) => s + Math.abs(v), 0) || 1;

  for (const [sym, rawW] of Object.entries(book)) {
    const w = Math.abs(rawW) / gross;
    const L = liquidity[sym];
    if (!L || w <= 0) continue;
    const participation = (aum * w) / Math.max(L.advUsd, 1);
    if (participation > worst) { worst = participation; bindingSymbol = sym; }
    if (participation > a.participationCap) breaches = true;
    cost += w * (0.5 * L.spreadBps + a.eta * L.dailyVol * Math.sqrt(participation) * 1e4 + a.feeBps);
  }
  return { costBps: 2 * cost, worstParticipation: worst, bindingSymbol, breaches };
}

function solveCrossing(lo: number, hi: number, f: (x: number) => number): number {
  if (f(lo) <= 0) return lo;
  if (f(hi) > 0) return hi;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);          // geometric: AUM spans orders of magnitude
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

export function analysePortfolio(
  strategies: StrategyInput[],
  liquidity: Record<string, NameLiquidity>,
  assumptions: Partial<CapacityAssumptions> = {},
  minAum = 1e6,
  maxAum = 5e10,
  steps = 60,
): PortfolioReport | null {
  if (!strategies.length) return null;
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };

  const T = Math.min(...strategies.map((s) => s.returns.length));
  if (T < 20) return null;
  const series = strategies.map((s) => s.returns.slice(-T));
  const periodsPerYear = TRADING_DAYS / Math.max(1, Math.round(756 / T));

  const mu = strategies.map((s) => s.grossAnnReturn);
  const cov = covariance(series).map((row) => row.map((v) => v * periodsPerYear));
  const w = maxSharpeWeights(mu, cov);

  const allocation = strategies
    .map((s, i) => ({ id: s.id, name: s.name, weight: w[i] }))
    .sort((x, y) => y.weight - x.weight);

  // Blended gross characteristics from the allocation.
  const blendedReturns: number[] = [];
  for (let t = 0; t < T; t++) blendedReturns.push(series.reduce((acc, s, i) => acc + w[i] * s[t], 0));
  const blendedGrossReturn = mean(blendedReturns) * periodsPerYear;
  const blendedVol = std(blendedReturns) * Math.sqrt(periodsPerYear);
  const blendedSharpe = blendedVol > 0 ? blendedGrossReturn / blendedVol : 0;

  const eqW = new Array(strategies.length).fill(1 / strategies.length);
  const eqReturns: number[] = [];
  for (let t = 0; t < T; t++) eqReturns.push(series.reduce((acc, s, i) => acc + eqW[i] * s[t], 0));
  const eqVol = std(eqReturns) * Math.sqrt(periodsPerYear);
  const equalWeightSharpe = eqVol > 0 ? (mean(eqReturns) * periodsPerYear) / eqVol : 0;

  // Turnover of the blend, weighted by allocation: a heavy tilt to reversal drags the whole book.
  const blendedTurnover = strategies.reduce((acc, s, i) => acc + w[i] * s.annualTurnover, 0);

  const book = blendBook(strategies, w);
  const netReturnAt = (aum: number) =>
    blendedGrossReturn - (costOf(book, liquidity, aum, a).costBps / 1e4) * blendedTurnover;

  const curve: JointPoint[] = [];
  const ratio = Math.pow(maxAum / minAum, 1 / (steps - 1));
  let liquidityLimited = 0;
  let aum = minAum;
  for (let i = 0; i < steps; i++, aum *= ratio) {
    const c = costOf(book, liquidity, aum, a);
    const net = blendedGrossReturn - (c.costBps / 1e4) * blendedTurnover;
    if (c.breaches && !liquidityLimited) liquidityLimited = aum;
    curve.push({
      aumUsd: aum, costBps: c.costBps, netAnnReturn: net,
      netSharpe: blendedVol > 0 ? net / blendedVol : 0,
      worstParticipation: c.worstParticipation,
      bindingSymbol: c.bindingSymbol,
      breaches: c.breaches,
    });
  }

  const half = 0.5 * blendedGrossReturn;
  const impactCap = solveCrossing(minAum, maxAum, (x) => netReturnAt(x) - half);
  const impactUnbounded = impactCap >= maxAum * 0.999;
  const liquidityBinds = liquidityLimited > 0 && (impactUnbounded || liquidityLimited < impactCap);
  const jointCapacity = liquidityBinds ? liquidityLimited : impactCap;

  // The naive figure is the sum over strategies that actually received an allocation. Including
  // strategies at zero weight would inflate a number that is already the wrong one.
  const naiveSumCapacity = strategies.reduce(
    (acc, s, i) => acc + (w[i] > 1e-4 ? s.deployableCapacity : 0), 0);

  const funded = strategies.map((s, i) => ({ s, w: w[i] })).filter((x) => x.w > 1e-4);
  const overlaps: OverlapPair[] = [];
  for (let i = 0; i < funded.length; i++) {
    for (let j = i + 1; j < funded.length; j++) {
      const A = funded[i].s, B = funded[j].s;
      let shared = 0;
      for (const [sym, wa] of Object.entries(A.weights)) {
        const wb = B.weights[sym];
        if (wb) shared += Math.min(wa, wb);   // overlapping book weight
      }
      overlaps.push({
        a: A.name, b: B.name, overlap: shared,
        correlation: correlation(A.returns, B.returns),
      });
    }
  }
  overlaps.sort((x, y) => y.overlap - x.overlap || Math.abs(y.correlation) - Math.abs(x.correlation));

  const avgCorrelation = overlaps.length
    ? overlaps.reduce((acc, o) => acc + o.correlation, 0) / overlaps.length : 0;

  // Diversification ratio: weighted average vol over portfolio vol. 1.0 means no benefit at all.
  const weightedVol = strategies.reduce((acc, s, i) => acc + w[i] * s.annVol, 0);
  const diversificationRatio = blendedVol > 0 ? weightedVol / blendedVol : 1;

  const atJoint = costOf(book, liquidity, jointCapacity, a);

  return {
    allocation, curve,
    naiveSumCapacity,
    jointCapacity,
    overlapTax: naiveSumCapacity > 0 ? Math.max(0, 1 - jointCapacity / naiveSumCapacity) : 0,
    blendedGrossReturn, blendedVol, blendedSharpe, equalWeightSharpe,
    avgCorrelation, diversificationRatio,
    topOverlaps: overlaps.slice(0, 6),
    bindingSymbol: atJoint.bindingSymbol,
    nameCount: Object.keys(book).length,
    sweepMaxAum: maxAum,
    jointCapacityUnbounded: jointCapacity >= maxAum * 0.999,
  };
}
