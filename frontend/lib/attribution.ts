/**
 * Factor attribution: how much of a strategy's return is alpha, and how much is repackaged beta?
 *
 * This is the first question any allocator asks, and a backtest that cannot answer it is not
 * finished. A rule that looks like it earns 20% a year is worth very little if 18 points of that
 * are market exposure the investor already owns for free.
 *
 * Factors are built from the universe itself by long-short spreads on the same panel the
 * strategies trade. That is an honest construction and a limited one:
 *
 *   MKT   equal-weighted universe return, the market proxy
 *   SMB   small minus big, proxied by traded value because there is no market-cap field
 *   MOM   winners minus losers on trailing 12-period return
 *   VOL   low minus high trailing volatility
 *   REV   short-term losers minus winners
 *
 * There is no HML here. Book-to-market needs fundamentals this universe does not carry, and a
 * price-only "value factor" would be a fabrication. Its absence is reported rather than papered
 * over, because an omitted factor inflates the residual alpha of anything loading on it.
 */

import type { AssetStats } from "./quant-types";
import { mean, normCdf, std, TRADING_DAYS } from "./stats";
import { analyticsCloses, analyticsDates } from "./strategies";

export const FACTOR_KEYS = ["MKT", "SMB", "MOM", "VOL", "REV"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export const FACTOR_LABELS: Record<FactorKey, string> = {
  MKT: "Market",
  SMB: "Size (traded-value proxy)",
  MOM: "Momentum",
  VOL: "Low volatility",
  REV: "Short-term reversal",
};

export interface FactorPanel {
  dates: string[];
  /** factor key -> period return series, aligned to `dates`. */
  returns: Record<FactorKey, number[]>;
}

export interface Attribution {
  strategyId: string;
  /** Annualised intercept: the part not explained by any factor. */
  alphaAnn: number;
  /** t-statistic of the intercept, Newey-West corrected for autocorrelation. */
  alphaT: number;
  /** Two-sided p-value of the intercept. */
  alphaP: number;
  betas: Record<FactorKey, number>;
  rSquared: number;
  /** Share of realised return explained by factor exposure rather than alpha. */
  explainedShare: number;
  nObs: number;
}

/** Cross-sectional long-short spread: top tercile minus bottom tercile by `score`. */
function spread(
  assets: AssetStats[],
  panel: Map<string, number[]>,
  T: number,
  t: number,
  score: (sym: string, hist: number[], a: AssetStats) => number,
): number {
  const ranked = assets
    .map((a) => {
      const s = panel.get(a.symbol);
      if (!s || !(s[t] > 0) || !(s[t + 1] > 0)) return null;
      return { sym: a.symbol, v: score(a.symbol, s.slice(0, t + 1), a), r: s[t + 1] / s[t] - 1 };
    })
    .filter((x): x is { sym: string; v: number; r: number } => x !== null && Number.isFinite(x.v));

  if (ranked.length < 9) return 0;
  ranked.sort((x, y) => y.v - x.v);
  const k = Math.max(1, Math.floor(ranked.length / 3));
  const top = mean(ranked.slice(0, k).map((x) => x.r));
  const bot = mean(ranked.slice(-k).map((x) => x.r));
  return top - bot;
}

const trailing = (h: number[], n: number) =>
  h.length > n && h[h.length - 1 - n] > 0 ? h[h.length - 1] / h[h.length - 1 - n] - 1 : 0;

function trailingVol(h: number[], n: number): number {
  const r: number[] = [];
  for (let i = Math.max(1, h.length - n); i < h.length; i++) if (h[i - 1] > 0) r.push(h[i] / h[i - 1] - 1);
  return r.length > 2 ? std(r) : 0;
}

/** Build the factor return panel from the universe, aligned to the strategy return dates. */
export function buildFactors(assets: AssetStats[]): FactorPanel {
  const usable = assets.filter((a) => analyticsCloses(a).length > 60 && a.advUsd > 0);
  if (usable.length < 9) {
    return { dates: [], returns: { MKT: [], SMB: [], MOM: [], VOL: [], REV: [] } };
  }
  const T = Math.min(...usable.map((a) => analyticsCloses(a).length));
  const dates = analyticsDates(usable[0]).slice(-T);
  const panel = new Map(usable.map((a) => [a.symbol, analyticsCloses(a).slice(-T)]));

  const out: Record<FactorKey, number[]> = { MKT: [], SMB: [], MOM: [], VOL: [], REV: [] };
  const outDates: string[] = [];

  for (let t = 60; t < T - 1; t++) {
    // Market: equal-weighted return of everything with a valid pair of prices.
    let acc = 0, n = 0;
    for (const s of panel.values()) if (s[t] > 0 && s[t + 1] > 0) { acc += s[t + 1] / s[t] - 1; n++; }
    if (!n) continue;
    out.MKT.push(acc / n);

    out.SMB.push(spread(usable, panel, T, t, (_s, _h, a) => -Math.log(Math.max(a.advUsd, 1))));
    out.MOM.push(spread(usable, panel, T, t, (_s, h) => trailing(h.slice(0, -1), 60)));
    out.VOL.push(spread(usable, panel, T, t, (_s, h) => -trailingVol(h, 60)));
    out.REV.push(spread(usable, panel, T, t, (_s, h) => -trailing(h, 3)));
    outDates.push(dates[t + 1]);
  }
  return { dates: outDates, returns: out };
}

/** Solve X'X b = X'y by Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;    // singular: collinear factors
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/**
 * Regress a strategy's returns on the factor panel.
 *
 * Standard errors are Newey-West with a small lag, not plain OLS. Strategy returns are
 * autocorrelated (a book rebalanced every eight bars carries the same names between rebalances),
 * and OLS standard errors under autocorrelation are too small, which turns luck into significance.
 */
export function attribute(
  strategyId: string,
  strategyDates: string[],
  strategyReturns: number[],
  factors: FactorPanel,
  periodsPerYear = TRADING_DAYS,
  lags = 3,
): Attribution | null {
  const idx = new Map(factors.dates.map((d, i) => [d, i]));
  const rows: { y: number; x: number[] }[] = [];
  strategyDates.forEach((d, i) => {
    const j = idx.get(d);
    if (j === undefined) return;
    const x = FACTOR_KEYS.map((k) => factors.returns[k][j]);
    if (x.some((v) => !Number.isFinite(v)) || !Number.isFinite(strategyReturns[i])) return;
    rows.push({ y: strategyReturns[i], x: [1, ...x] });
  });

  const T = rows.length;
  const p = FACTOR_KEYS.length + 1;
  if (T < p + 20) return null;

  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Xty = new Array(p).fill(0);
  for (const { y, x } of rows) {
    for (let i = 0; i < p; i++) {
      Xty[i] += x[i] * y;
      for (let j = 0; j < p; j++) XtX[i][j] += x[i] * x[j];
    }
  }
  const b = solve(XtX, Xty);
  if (!b) return null;

  const resid = rows.map(({ y, x }) => y - x.reduce((a, v, i) => a + v * b[i], 0));
  const ys = rows.map((r) => r.y);
  const my = mean(ys);
  const ssTot = ys.reduce((a, v) => a + (v - my) ** 2, 0);
  const ssRes = resid.reduce((a, v) => a + v * v, 0);
  const rSquared = ssTot > 1e-18 ? 1 - ssRes / ssTot : 0;

  // Newey-West variance of the intercept only, which is the coefficient we report on.
  const inv = solve(XtX, Array.from({ length: p }, (_, i) => (i === 0 ? 1 : 0)));
  if (!inv) return null;
  let meat = 0;
  const u = rows.map(({ x }, t) => x.reduce((a, v, i) => a + v * inv[i], 0) * resid[t]);
  for (const v of u) meat += v * v;
  for (let l = 1; l <= lags; l++) {
    const wgt = 1 - l / (lags + 1);                     // Bartlett kernel
    for (let t = l; t < T; t++) meat += 2 * wgt * u[t] * u[t - l];
  }
  const seAlpha = Math.sqrt(Math.max(meat, 1e-24));
  const alphaT = seAlpha > 0 ? b[0] / seAlpha : 0;

  const betas = {} as Record<FactorKey, number>;
  FACTOR_KEYS.forEach((k, i) => { betas[k] = b[i + 1]; });

  const alphaAnn = b[0] * periodsPerYear;
  const totalAnn = my * periodsPerYear;
  const explainedShare = Math.abs(totalAnn) > 1e-9
    ? Math.min(1, Math.max(0, 1 - Math.abs(alphaAnn) / Math.abs(totalAnn)))
    : 0;

  return {
    strategyId,
    alphaAnn,
    alphaT,
    alphaP: 2 * (1 - normCdf(Math.abs(alphaT))),
    betas,
    rSquared,
    explainedShare,
    nObs: T,
  };
}
