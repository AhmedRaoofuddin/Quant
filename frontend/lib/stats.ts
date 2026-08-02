/**
 * Shared statistics used by the backtest engine and the validation battery. Kept dependency-free
 * and pure so every figure is reproducible and unit-testable.
 */

export const TRADING_DAYS = 252;

export function mean(xs: number[]): number {
  const v = xs.filter((x) => !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : Number.NaN;
}

export function std(xs: number[]): number {
  const v = xs.filter((x) => !Number.isNaN(x));
  if (v.length < 2) return Number.NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
}

/** Annualised Sharpe ratio of a per-period return series. */
export function annualisedSharpe(returns: number[], periods = TRADING_DAYS): number {
  const s = std(returns);
  if (!(s > 0)) return 0;
  return (Math.sqrt(periods) * mean(returns)) / s;
}

/** Standardised sample moment (p = 3 skewness, p = 4 non-excess kurtosis). */
export function moment(returns: number[], p: number): number {
  const v = returns.filter((x) => !Number.isNaN(x));
  const m = mean(v);
  const s = std(v);
  if (!(s > 0) || v.length < 3) return p === 4 ? 3 : 0;
  return v.reduce((a, x) => a + ((x - m) / s) ** p, 0) / v.length;
}

/** Standard-normal CDF via the error function. */
export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return Math.sign(x) * y;
}

/** Inverse standard-normal CDF (Acklam's rational approximation). */
export function normPpf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
