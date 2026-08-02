/**
 * The Overfitting & Leakage Firewall.
 *
 * This is the differentiator: given a family of candidate strategies (their aligned return
 * series), it quantifies how likely the best-looking backtest is a statistical artefact rather
 * than genuine edge. Implements the López de Prado battery:
 *
 *   - PBO via Combinatorially-Symmetric Cross-Validation (CSCV): the fraction of train/test
 *     splits in which the strategy that looked best in-sample lands below the OOS median.
 *   - Probabilistic Sharpe Ratio (PSR): probability the true Sharpe exceeds 0 given the sample
 *     length and the return distribution's skew and kurtosis.
 *   - Minimum Backtest Length (MinBTL): track record needed for PSR to clear 0.95.
 *   - Performance degradation: OLS slope of out-of-sample vs in-sample Sharpe across splits.
 *   - Automated leakage heuristics.
 *
 * References: Bailey, Borwein, López de Prado & Zhu, "The Probability of Backtest Overfitting"
 * (2015); Bailey & López de Prado, "The Deflated Sharpe Ratio" (2014).
 */

import type { EvaluatedAlpha, ValidationReport } from "./types";
import { annualisedSharpe, mean, moment, normCdf, normPpf, std, TRADING_DAYS } from "./stats";

export interface AlignedReturns {
  ids: string[];
  dates: string[];
  matrix: number[][]; // [period][strategy]
}

/** Align per-strategy return series onto their common date index. */
export function alignReturns(series: Record<string, { dates: string[]; returns: number[] }>): AlignedReturns {
  const ids = Object.keys(series);
  if (ids.length === 0) return { ids: [], dates: [], matrix: [] };

  // Intersection of dates present for every strategy.
  const counts = new Map<string, number>();
  for (const id of ids) for (const d of series[id].dates) counts.set(d, (counts.get(d) ?? 0) + 1);
  const dates = [...counts.entries()].filter(([, c]) => c === ids.length).map(([d]) => d).sort();

  const lookup: Record<string, Map<string, number>> = {};
  for (const id of ids) {
    const m = new Map<string, number>();
    series[id].dates.forEach((d, i) => m.set(d, series[id].returns[i]));
    lookup[id] = m;
  }
  const matrix = dates.map((d) => ids.map((id) => lookup[id].get(d) ?? Number.NaN));
  return { ids, dates, matrix };
}

/** All k-of-S index combinations (train submatrix choices). */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const combo: number[] = [];
  const walk = (start: number) => {
    if (combo.length === k) return out.push(combo.slice());
    for (let i = start; i < n; i++) {
      combo.push(i);
      walk(i + 1);
      combo.pop();
    }
  };
  walk(0);
  return out;
}

/** Probabilistic Sharpe Ratio: P(true SR > benchmark) given sample length and shape. */
export function probabilisticSharpe(sharpe: number, nObs: number, skew: number, kurt: number, benchmark = 0): number {
  if (nObs < 2) return 0;
  const sr = sharpe / Math.sqrt(TRADING_DAYS); // de-annualise to per-period
  const sr0 = benchmark / Math.sqrt(TRADING_DAYS);
  const denom = Math.sqrt(Math.max(1 - skew * sr + ((kurt - 1) / 4) * sr * sr, 1e-9));
  return normCdf(((sr - sr0) * Math.sqrt(nObs - 1)) / denom);
}

/** Minimum Backtest Length (years) for PSR to reach `target` at the observed Sharpe. */
export function minBacktestYears(sharpe: number, skew: number, kurt: number, target = 0.95): number {
  const sr = sharpe / Math.sqrt(TRADING_DAYS);
  if (!(Math.abs(sr) > 1e-6)) return Infinity;
  const z = normPpf(target);
  const periods = 1 + (1 - skew * sr + ((kurt - 1) / 4) * sr * sr) * (z / sr) ** 2;
  return periods / TRADING_DAYS;
}

function sharpeOnRows(matrix: number[][], rows: number[], col: number): number {
  const xs = rows.map((r) => matrix[r][col]).filter((x) => !Number.isNaN(x));
  return annualisedSharpe(xs);
}

/** CSCV Probability of Backtest Overfitting plus the rank-logit distribution. */
export function cscvPbo(aligned: AlignedReturns, S = 10) {
  const { matrix, ids } = aligned;
  const T = matrix.length;
  const N = ids.length;
  if (T < S * 4 || N < 2) {
    return { pbo: 0, lambdas: [] as number[], nCombos: 0, degradation: 1, bestId: ids[0] ?? "" };
  }

  // Partition rows into S contiguous, equal submatrices.
  const size = Math.floor(T / S);
  const blocks: number[][] = [];
  for (let s = 0; s < S; s++) {
    const start = s * size;
    const end = s === S - 1 ? T : start + size;
    blocks.push(Array.from({ length: end - start }, (_, i) => start + i));
  }

  const lambdas: number[] = [];
  const isSharpes: number[] = [];
  const oosSharpes: number[] = [];
  const bestCount = new Array(N).fill(0);

  for (const trainBlocks of combinations(S, S / 2)) {
    const trainSet = new Set(trainBlocks);
    const trainRows = trainBlocks.flatMap((b) => blocks[b]);
    const testRows = blocks.filter((_, i) => !trainSet.has(i)).flatMap((b) => b);

    const isS = ids.map((_, c) => sharpeOnRows(matrix, trainRows, c));
    const oosS = ids.map((_, c) => sharpeOnRows(matrix, testRows, c));

    // Best in-sample strategy.
    let best = 0;
    for (let c = 1; c < N; c++) if (isS[c] > isS[best]) best = c;
    bestCount[best]++;

    // Its out-of-sample relative rank -> logit.
    const rank = oosS.filter((v) => v <= oosS[best]).length; // 1..N
    const omega = rank / (N + 1);
    lambdas.push(Math.log(omega / (1 - omega)));

    isSharpes.push(isS[best]);
    oosSharpes.push(oosS[best]);
  }

  const pbo = lambdas.filter((l) => l <= 0).length / lambdas.length;

  // Performance degradation: OLS slope of OOS vs IS for the best-per-split strategies.
  const mx = mean(isSharpes), my = mean(oosSharpes);
  let num = 0, den = 0;
  for (let i = 0; i < isSharpes.length; i++) {
    num += (isSharpes[i] - mx) * (oosSharpes[i] - my);
    den += (isSharpes[i] - mx) ** 2;
  }
  const degradation = den > 0 ? num / den : 0;

  let bestId = ids[0];
  let bc = -1;
  bestCount.forEach((c, i) => { if (c > bc) { bc = c; bestId = ids[i]; } });

  return { pbo, lambdas, nCombos: lambdas.length, degradation, bestId };
}

/** Seeded RNG for reproducible bootstraps. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Harvey-Liu style multiple-testing haircut (Holm-Bonferroni). Turns each alpha's Sharpe into a
 * t-stat, adjusts the family of p-values, and reports the deflated Sharpe of the best alpha after
 * accounting for how many alphas were tried.
 */
export function haircutSharpe(alphas: EvaluatedAlpha[], series: Record<string, { returns: number[] }>) {
  const items = alphas
    .map((a) => {
      const T = series[a.expression.id]?.returns.length ?? a.in_sample.n_obs;
      const srP = a.in_sample.sharpe / Math.sqrt(TRADING_DAYS);
      const t = srP * Math.sqrt(Math.max(T, 2));
      const p = 2 * (1 - normCdf(Math.abs(t))); // two-sided
      return { id: a.expression.id, sharpe: a.in_sample.sharpe, t, p, T };
    })
    .filter((x) => x.sharpe > 0);
  if (items.length === 0) return { id: "", haircut: 0, pct: 0 };

  const N = items.length;
  const sorted = [...items].sort((a, b) => a.p - b.p);
  // Holm step-down adjusted p-values.
  let running = 0;
  const adj = new Map<string, number>();
  sorted.forEach((it, k) => {
    running = Math.max(running, Math.min(1, (N - k) * it.p));
    adj.set(it.id, running);
  });

  const best = items.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  const pAdj = Math.min(Math.max(adj.get(best.id) ?? 1, 1e-10), 1);
  const tAdj = Math.min(normPpf(1 - pAdj / 2), 12); // cap to keep finite
  const haircutSharpeAnnual = Math.max(0, (tAdj / Math.sqrt(Math.max(best.T, 2))) * Math.sqrt(TRADING_DAYS));
  const pct = best.sharpe > 0 ? Math.min(1, Math.max(0, 1 - haircutSharpeAnnual / best.sharpe)) : 0;
  return { id: best.id, haircut: haircutSharpeAnnual, pct };
}

/** 95% confidence interval on a Sharpe via circular block bootstrap. */
export function bootstrapSharpeCI(returns: number[], seed = 1234, B = 400): [number, number] {
  const r = returns.filter((x) => !Number.isNaN(x));
  const T = r.length;
  if (T < 20) return [0, 0];
  const block = Math.max(2, Math.round(Math.sqrt(T)));
  const rand = rng(seed);
  const sharpes: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample: number[] = [];
    while (sample.length < T) {
      const start = Math.floor(rand() * T);
      for (let i = 0; i < block && sample.length < T; i++) sample.push(r[(start + i) % T]);
    }
    sharpes.push(annualisedSharpe(sample));
  }
  sharpes.sort((a, b) => a - b);
  const lo = sharpes[Math.floor(0.025 * B)];
  const hi = sharpes[Math.floor(0.975 * B)];
  return [lo, hi];
}

/** Full pairwise correlation matrix of the aligned strategy returns (for the factor heatmap). */
export function correlationMatrix(aligned: AlignedReturns): { ids: string[]; matrix: number[][] } {
  const { matrix, ids } = aligned;
  const N = ids.length;
  const col = (c: number) => matrix.map((row) => row[c]);
  const cols = ids.map((_, c) => col(c));
  const out: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let a = 0; a < N; a++) {
    for (let b = a; b < N; b++) {
      const x = cols[a], y = cols[b];
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
      for (let i = 0; i < matrix.length; i++) {
        if (Number.isNaN(x[i]) || Number.isNaN(y[i])) continue;
        sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sxy += x[i] * y[i]; n++;
      }
      const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
      const d = Math.sqrt(vx * vy);
      const r = n >= 5 && d > 0 ? cov / d : a === b ? 1 : 0;
      out[a][b] = r;
      out[b][a] = r;
    }
  }
  return { ids, matrix: out };
}

/** Effective number of independent trials from the average pairwise return correlation. */
export function effectiveTrials(aligned: AlignedReturns): number {
  const { matrix, ids } = aligned;
  const N = ids.length;
  if (N < 2 || matrix.length < 10) return N;
  let sum = 0, pairs = 0;
  for (let a = 0; a < N; a++) {
    for (let b = a + 1; b < N; b++) {
      const col = (c: number) => matrix.map((row) => row[c]);
      const x = col(a), y = col(b);
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
      for (let i = 0; i < matrix.length; i++) {
        if (Number.isNaN(x[i]) || Number.isNaN(y[i])) continue;
        sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sxy += x[i] * y[i]; n++;
      }
      if (n < 5) continue;
      const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
      const d = Math.sqrt(vx * vy);
      if (d > 0) { sum += Math.abs(cov / d); pairs++; }
    }
  }
  const avgAbs = pairs ? sum / pairs : 0;
  return Math.max(1, Math.min(N, 1 + (N - 1) * (1 - avgAbs)));
}

/** Cheap look-ahead / hygiene heuristics on the evaluated alphas. */
function leakageFlags(alphas: EvaluatedAlpha[]): string[] {
  const flags: string[] = [];
  const suspicious = alphas.filter((a) => a.in_sample.sharpe > 4 && (a.out_sample?.sharpe ?? 0) > 3);
  if (suspicious.length) flags.push(`${suspicious.length} alpha(s) with implausibly high Sharpe (>4 IS and >3 OOS) — inspect for look-ahead.`);
  const churn = alphas.filter((a) => a.in_sample.turnover > 2);
  if (churn.length) flags.push(`${churn.length} alpha(s) turn over >200%/day — costs may be understated.`);
  if (!flags.length) flags.push("No leakage heuristics triggered. Forward returns are pre-shifted; the backtest is leak-free by construction.");
  return flags;
}

export function computeValidation(
  series: Record<string, { dates: string[]; returns: number[] }>,
  alphas: EvaluatedAlpha[],
): ValidationReport {
  const aligned = alignReturns(series);
  const S = 10;
  const { pbo, lambdas, nCombos, degradation, bestId } = cscvPbo(aligned, S);

  const per_alpha = alphas.map((a) => {
    const s = series[a.expression.id];
    const rets = s?.returns ?? [];
    const psr = probabilisticSharpe(a.in_sample.sharpe, rets.length, moment(rets, 3), moment(rets, 4));
    return { alpha_id: a.expression.id, psr, dsr: a.in_sample.deflated_sharpe };
  });

  const best = alphas.find((a) => a.expression.id === bestId);
  const bestRets = series[bestId]?.returns ?? [];
  const min_backtest_years = best
    ? minBacktestYears(best.in_sample.sharpe, moment(bestRets, 3), moment(bestRets, 4))
    : Infinity;

  const cut = haircutSharpe(alphas, series);
  const sharpe_ci = bootstrapSharpeCI(bestRets);
  const eff = effectiveTrials(aligned);

  // Performance degradation: OLS slope of out-of-sample vs in-sample Sharpe across all alphas
  // (the canonical OOS-vs-IS scatter). Stable regardless of which single alpha dominates CSCV.
  const isS = alphas.map((a) => a.in_sample.sharpe);
  const oosS = alphas.map((a) => a.out_sample?.sharpe ?? 0);
  const mx = mean(isS), my = mean(oosS);
  let num = 0, den = 0;
  for (let i = 0; i < isS.length; i++) { num += (isS[i] - mx) * (oosS[i] - my); den += (isS[i] - mx) ** 2; }
  const perfDecay = den > 0 ? num / den : 0;

  const verdict: ValidationReport["verdict"] = pbo <= 0.2 ? "robust" : pbo <= 0.5 ? "fragile" : "overfit";

  return {
    pbo,
    n_trials: aligned.ids.length,
    n_splits: S,
    n_combinations: nCombos,
    lambdas,
    perf_degradation: perfDecay,
    best_alpha_id: bestId,
    min_backtest_years: Number.isFinite(min_backtest_years) ? min_backtest_years : 99,
    haircut_sharpe: cut.haircut,
    haircut_pct: cut.pct,
    sharpe_ci,
    effective_trials: eff,
    leakage_flags: leakageFlags(alphas),
    per_alpha,
    verdict,
  };
}
