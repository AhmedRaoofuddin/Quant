/**
 * Strategy capacity: how much capital a signal absorbs before its alpha is eaten by its own
 * market impact. TypeScript mirror of backend/src/capacity/CapacityModel.cpp.
 *
 * A Sharpe ratio quoted without a capacity is close to meaningless. Gross Sharpe 1.5 that
 * saturates at $100m is worth far less to an allocator than Sharpe 0.8 that scales to $5b.
 * Funds run this internally; open-source backtesters publish a Sharpe and stop there.
 *
 *   cost_bps(Q) = half_spread + eta * sigma_daily * sqrt(Q / ADV) * 1e4 + fees
 *
 * The square-root term is the Almgren-Chriss / BARRA temporary-impact law. Gross P&L scales
 * linearly with AUM while cost scales as sqrt(AUM), so net alpha is unimodal: it rises, peaks,
 * then goes negative. Where it crosses zero is the capacity.
 */

import type { AssetStats } from "./quant-types";

export interface PositionLiquidity {
  symbol: string;
  weight: number;
  advUsd: number;
  dailyVol: number;
  spreadBps: number;
}

export interface CapacityAssumptions {
  grossAnnReturn: number;
  annVol: number;
  annualTurnover: number;
  eta: number;
  participationCap: number;
  feeBps: number;
}

export interface CapacityPoint {
  aumUsd: number;
  participation: number;
  costBps: number;
  annualCost: number;
  netAnnReturn: number;
  netSharpe: number;
  breachesParticipation: boolean;
}

export interface CapacityReport {
  curve: CapacityPoint[];
  grossSharpe: number;
  capacityAtHalfSharpe: number;
  capacityAtZeroAlpha: number;
  peakNetPnlAum: number;
  peakNetPnlUsd: number;
  liquidityLimitedAum: number;
  bindingConstraint: "impact" | "liquidity";
  /** What can actually be deployed: whichever limit binds first. */
  deployableCapacity: number;
  /** True when impact never ate half the Sharpe inside the sweep, so the figure is a floor. */
  impactCapacityUnbounded: boolean;
  /** True when alpha never reached zero inside the sweep, so that figure is a floor too. */
  zeroAlphaUnbounded: boolean;
  /** True when dollar P&L was still climbing at the top of the sweep, so the peak is a floor. */
  peakPnlUnbounded: boolean;
  /** Upper bound of the sweep, so callers can render a floor as "> $X" rather than a number. */
  sweepMaxAum: number;
  book: PositionLiquidity[];
  assumptions: CapacityAssumptions;
}

export const DEFAULT_ASSUMPTIONS: CapacityAssumptions = {
  grossAnnReturn: 0.2,
  annVol: 0.1,
  annualTurnover: 12,
  eta: 0.55,
  participationCap: 0.1,
  feeBps: 0.5,
};

function normalise(book: PositionLiquidity[]): PositionLiquidity[] {
  const gross = book.reduce((s, p) => s + Math.abs(p.weight), 0);
  if (gross <= 0) return book;
  return book.map((p) => ({ ...p, weight: Math.abs(p.weight) / gross }));
}

export function costBps(book: PositionLiquidity[], a: CapacityAssumptions, aumUsd: number) {
  let weightedCost = 0, weightedPart = 0, breach = false;
  for (const p of book) {
    if (p.weight <= 0) continue;
    const notional = aumUsd * p.weight;
    const adv = Math.max(p.advUsd, 1);
    const participation = notional / adv;
    if (participation > a.participationCap) breach = true;
    const impactBps = a.eta * p.dailyVol * Math.sqrt(participation) * 1e4;
    weightedCost += p.weight * (0.5 * p.spreadBps + impactBps + a.feeBps);
    weightedPart += p.weight * participation;
  }
  return { costBps: 2 * weightedCost, participation: weightedPart, breach };
}

/** Geometric bisection for the AUM where a decreasing function crosses zero. */
function solveCrossing(lo: number, hi: number, f: (x: number) => number): number {
  if (f(lo) <= 0) return lo;
  if (f(hi) > 0) return hi;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

export function analyseCapacity(
  rawBook: PositionLiquidity[],
  assumptions: CapacityAssumptions,
  minAum = 1e6,
  maxAum = 5e10,
  steps = 60,
): CapacityReport {
  const book = normalise(rawBook);
  const a = assumptions;
  const grossSharpe = a.annVol > 0 ? a.grossAnnReturn / a.annVol : 0;

  const netReturnAt = (aum: number) =>
    a.grossAnnReturn - (costBps(book, a, aum).costBps / 1e4) * a.annualTurnover;

  const curve: CapacityPoint[] = [];
  const ratio = Math.pow(maxAum / minAum, 1 / (steps - 1));
  let aum = minAum, bestPnl = -Infinity, peakAum = minAum, peakPnl = 0, liquidityLimited = 0;

  for (let i = 0; i < steps; i++, aum *= ratio) {
    const c = costBps(book, a, aum);
    const annualCost = (c.costBps / 1e4) * a.annualTurnover;
    const netAnnReturn = a.grossAnnReturn - annualCost;
    const pnl = netAnnReturn * aum;
    if (pnl > bestPnl) { bestPnl = pnl; peakAum = aum; peakPnl = pnl; }
    if (c.breach && liquidityLimited === 0) liquidityLimited = aum;
    curve.push({
      aumUsd: aum, participation: c.participation, costBps: c.costBps,
      annualCost, netAnnReturn, netSharpe: a.annVol > 0 ? netAnnReturn / a.annVol : 0,
      breachesParticipation: c.breach,
    });
  }

  const half = 0.5 * grossSharpe * a.annVol;
  const capacityAtHalfSharpe = solveCrossing(minAum, maxAum, (x) => netReturnAt(x) - half);
  const capacityAtZeroAlpha = solveCrossing(minAum, maxAum, (x) => netReturnAt(x));

  // If impact never consumed half the Sharpe inside the sweep, the figure is a floor rather
  // than a capacity, and the participation cap is what really limits deployment.
  const impactCapacityUnbounded = capacityAtHalfSharpe >= maxAum * 0.999;
  const zeroAlphaUnbounded = capacityAtZeroAlpha >= maxAum * 0.999;
  const liquidityBinds = liquidityLimited > 0 && (impactCapacityUnbounded || liquidityLimited < capacityAtHalfSharpe);
  const deployableCapacity = liquidityBinds ? liquidityLimited : capacityAtHalfSharpe;

  return {
    curve, grossSharpe, capacityAtHalfSharpe, capacityAtZeroAlpha,
    peakNetPnlAum: peakAum, peakNetPnlUsd: peakPnl,
    liquidityLimitedAum: liquidityLimited,
    bindingConstraint: liquidityBinds ? "liquidity" : "impact",
    deployableCapacity, impactCapacityUnbounded,
    zeroAlphaUnbounded, peakPnlUnbounded: peakAum >= maxAum * 0.999,
    sweepMaxAum: maxAum,
    book, assumptions: a,
  };
}

/** Build a book from screened assets, equally weighting the top names by Sharpe. */
export function bookFromAssets(assets: AssetStats[], n = 10): PositionLiquidity[] {
  return [...assets]
    .sort((x, y) => y.sharpe - x.sharpe)
    .slice(0, n)
    .map((a) => ({
      symbol: a.symbol,
      weight: 1,
      advUsd: a.advUsd,
      dailyVol: a.annVol / Math.sqrt(252),
      spreadBps: a.spreadBps,
    }));
}
