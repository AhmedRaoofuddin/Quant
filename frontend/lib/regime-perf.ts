/**
 * Regime-conditional performance.
 *
 * A single Sharpe ratio averages over market states that behave nothing alike. Momentum earns its
 * reputation in calm trending markets and gives much of it back in turbulent ones; low volatility
 * does the reverse. An allocator sizing a book cares which of those they are buying, because the
 * blended number hides it.
 *
 * States come from the Gaussian HMM in `hmm.ts`, fitted on the market proxy and decoded with
 * Viterbi, so the split is estimated from the data rather than drawn at an arbitrary vol
 * threshold.
 *
 * The honest caveat, surfaced in the UI: a two-state split on a few hundred observations leaves
 * the turbulent bucket small. Per-regime Sharpes are noisy and should be read as direction of
 * travel, not as measurements. `reliable` is false wherever the sample is too thin to lean on.
 */

import { detectRegimes, type RegimeModel } from "./hmm";
import { mean, std, TRADING_DAYS } from "./stats";

export interface RegimeSlice {
  state: number;
  label: string;
  nObs: number;
  annReturn: number;
  annVol: number;
  sharpe: number;
  hitRate: number;
  worstPeriod: number;
  /** False when the bucket is too small for the numbers to mean much. */
  reliable: boolean;
}

export interface RegimePerformance {
  strategyId: string;
  slices: RegimeSlice[];
  /** Sharpe in the calm state minus Sharpe in the turbulent state. */
  regimeSpread: number;
  /** Which state this strategy is better in. */
  favours: string;
}

/** Minimum observations before a per-regime figure is worth quoting. */
const MIN_OBS = 25;

export function regimePerformance(
  strategyId: string,
  dates: string[],
  returns: number[],
  model: RegimeModel,
  periodsPerYear = TRADING_DAYS,
): RegimePerformance | null {
  const stateAt = new Map(model.dates.map((d, i) => [d, model.states[i]]));

  const buckets = new Map<number, number[]>();
  dates.forEach((d, i) => {
    const s = stateAt.get(d);
    if (s === undefined || !Number.isFinite(returns[i])) return;
    if (!buckets.has(s)) buckets.set(s, []);
    buckets.get(s)!.push(returns[i]);
  });
  if (!buckets.size) return null;

  const slices: RegimeSlice[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([state, rs]) => {
      const sd = std(rs);
      const annReturn = mean(rs) * periodsPerYear;
      const annVol = sd * Math.sqrt(periodsPerYear);
      return {
        state,
        label: model.labels[state] ?? `State ${state}`,
        nObs: rs.length,
        annReturn,
        annVol,
        sharpe: annVol > 0 ? annReturn / annVol : 0,
        hitRate: rs.length ? rs.filter((x) => x > 0).length / rs.length : 0,
        worstPeriod: rs.length ? Math.min(...rs) : 0,
        reliable: rs.length >= MIN_OBS,
      };
    });

  const calm = slices.find((s) => s.state === 0);
  const turbulent = slices.find((s) => s.state === 1);
  const regimeSpread = (calm?.sharpe ?? 0) - (turbulent?.sharpe ?? 0);

  // Only claim a preference when both buckets carry enough observations to compare.
  const comparable = calm?.reliable && turbulent?.reliable;
  const favours = !comparable
    ? "insufficient data"
    : regimeSpread > 0.25 ? (calm?.label ?? "calm")
    : regimeSpread < -0.25 ? (turbulent?.label ?? "turbulent")
    : "both, roughly equally";

  return { strategyId, slices, regimeSpread, favours };
}

/** Fit the regime model once on the market proxy, then reuse it across every strategy. */
export function fitMarketRegimes(dates: string[], marketReturns: number[]): RegimeModel | null {
  if (marketReturns.length < 60) return null;
  return detectRegimes(marketReturns, dates);
}
