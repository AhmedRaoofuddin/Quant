/**
 * A faithful TypeScript port of the Alpha-Forge quant core, so the dashboard runs real
 * computations on localhost without the C++ service. It generates synthetic prices, evaluates
 * the alpha formulas, runs a leak-free cross-sectional backtest, computes Sharpe / deflated
 * Sharpe / IC, selects for significance and decorrelation, and allocates by risk parity.
 *
 * The numbers here are computed, never hand-written. The C++ engine remains the production
 * backend and implements the same pipeline; this exists so the UI is fully working standalone.
 */

import type { AlphaMetrics, Allocation, DiscoveryRun, EvaluatedAlpha } from "./types";
import { alignReturns, computeValidation, correlationMatrix } from "./validation";
import { detectRegimes } from "./hmm";

type Matrix = number[][]; // [day][symbol]
const NaNv = Number.NaN;
const isNaNv = (x: number) => Number.isNaN(x);

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rand: () => number) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const UNIVERSE = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "JNJ", "WMT", "PG", "XOM", "HD", "BAC"];

interface Fields {
  dates: string[];
  symbols: string[];
  open: Matrix; high: Matrix; low: Matrix; close: Matrix;
  volume: Matrix; vwap: Matrix; returns: Matrix; dollar_volume: Matrix;
  forward: Matrix;
}

function tradingDates(n: number, startISO: string): string[] {
  const out: string[] = [];
  const d = new Date(startISO);
  while (out.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function syntheticFields(seed: number, nDays: number): Fields {
  const rand = mulberry32(seed);
  const symbols = UNIVERSE;
  const nSym = symbols.length;
  const dates = tradingDates(nDays, "2015-01-02");

  // Market factor with Markov-switching volatility: calm regimes (low vol, positive drift) punctuated
  // by turbulent regimes (high vol, negative drift). This gives the HMM real regimes to find and the
  // equity curve visible drawdowns.
  const market: number[] = [];
  let regimeState = 0;
  for (let i = 0; i < nDays; i++) {
    const switchProb = regimeState === 0 ? 0.012 : 0.06; // calm persists longer than turbulence
    if (rand() < switchProb) regimeState = 1 - regimeState;
    const vol = regimeState === 0 ? 0.007 : 0.021;
    const drift = regimeState === 0 ? 0.0006 : -0.0005;
    market.push(drift + vol * gaussian(rand));
  }

  const close: Matrix = Array.from({ length: nDays }, () => new Array(nSym).fill(0));
  const open: Matrix = Array.from({ length: nDays }, () => new Array(nSym).fill(0));
  const high: Matrix = Array.from({ length: nDays }, () => new Array(nSym).fill(0));
  const low: Matrix = Array.from({ length: nDays }, () => new Array(nSym).fill(0));
  const volume: Matrix = Array.from({ length: nDays }, () => new Array(nSym).fill(0));

  for (let j = 0; j < nSym; j++) {
    const beta = 0.6 + 0.8 * rand();
    let prevIdio = 0;
    let price = 100;
    for (let i = 0; i < nDays; i++) {
      // Idiosyncratic return carries a modest, persistent AR(1) component plus white noise, so
      // cross-sectional momentum has a real, out-of-sample-stable edge (portfolio Sharpe ~1.5-2.5)
      // rather than the implausible Sharpe of a strongly autocorrelated series or the zero edge
      // of pure noise.
      prevIdio = 0.18 * prevIdio + 0.010 * gaussian(rand);
      const r = beta * market[i] + prevIdio + 0.005 * gaussian(rand);
      price *= Math.exp(r);
      close[i][j] = price;
      open[i][j] = price * (1 + 0.002 * gaussian(rand));
      const hi = Math.max(open[i][j], close[i][j]);
      const lo = Math.min(open[i][j], close[i][j]);
      high[i][j] = hi * (1 + Math.abs(0.003 * gaussian(rand)));
      low[i][j] = lo * (1 - Math.abs(0.003 * gaussian(rand)));
      volume[i][j] = (1e6 + rand() * 1.9e7) * (1 + 0.1 * j);
    }
  }

  const vwap = mapMat3(high, low, close, (h, l, c) => (h + l + c) / 3);
  const dollar_volume = mapMat2(close, volume, (c, v) => c * v);
  const returns: Matrix = Array.from({ length: nDays }, () => new Array(nSym).fill(NaNv));
  for (let j = 0; j < nSym; j++)
    for (let i = 1; i < nDays; i++) returns[i][j] = close[i][j] / close[i - 1][j] - 1;

  const forward: Matrix = Array.from({ length: nDays }, () => new Array(nSym).fill(NaNv));
  for (let j = 0; j < nSym; j++)
    for (let i = 0; i + 1 < nDays; i++) forward[i][j] = close[i + 1][j] / close[i][j] - 1;

  return { dates, symbols, open, high, low, close, volume, vwap, returns, dollar_volume, forward };
}

// ---- matrix helpers --------------------------------------------------------
function mapMat2(a: Matrix, b: Matrix, f: (x: number, y: number) => number): Matrix {
  return a.map((row, i) => row.map((x, j) => f(x, b[i][j])));
}
function mapMat3(a: Matrix, b: Matrix, c: Matrix, f: (x: number, y: number, z: number) => number): Matrix {
  return a.map((row, i) => row.map((x, j) => f(x, b[i][j], c[i][j])));
}
function neg(m: Matrix): Matrix { return m.map((r) => r.map((x) => -x)); }
function sub(a: Matrix, b: Matrix): Matrix { return mapMat2(a, b, (x, y) => x - y); }
function mul(a: Matrix, b: Matrix): Matrix { return mapMat2(a, b, (x, y) => x * y); }
function sign(m: Matrix): Matrix { return m.map((r) => r.map((x) => (isNaNv(x) ? NaNv : Math.sign(x)))); }

function csRank(m: Matrix): Matrix {
  return m.map((row) => {
    const valid = row.filter((x) => !isNaNv(x));
    return row.map((x) => {
      if (isNaNv(x)) return NaNv;
      let less = 0, equal = 0;
      for (const v of valid) { if (v < x) less++; else if (v === x) equal++; }
      return valid.length <= 1 ? NaNv : (less + (equal + 1) / 2) / valid.length;
    });
  });
}
function csDemean(m: Matrix): Matrix {
  return m.map((row) => {
    const valid = row.filter((x) => !isNaNv(x));
    const mean = valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : NaNv;
    return row.map((x) => (isNaNv(x) ? NaNv : x - mean));
  });
}
function csZscore(m: Matrix): Matrix {
  return m.map((row) => {
    const valid = row.filter((x) => !isNaNv(x));
    if (valid.length < 2) return row.map(() => NaNv);
    const mean = valid.reduce((s, x) => s + x, 0) / valid.length;
    const varr = valid.reduce((s, x) => s + (x - mean) ** 2, 0) / (valid.length - 1);
    const sd = Math.sqrt(varr);
    return row.map((x) => (isNaNv(x) || sd === 0 ? NaNv : (x - mean) / sd));
  });
}
function csScale(m: Matrix): Matrix {
  return m.map((row) => {
    const denom = row.reduce((s, x) => s + (isNaNv(x) ? 0 : Math.abs(x)), 0);
    return row.map((x) => (isNaNv(x) || denom === 0 ? 0 : x / denom));
  });
}
function tsShift(m: Matrix, k: number): Matrix {
  const out = m.map((r) => r.map(() => NaNv));
  for (let i = 0; i < m.length; i++) { const s = i - k; if (s >= 0 && s < m.length) out[i] = m[s].slice(); }
  return out;
}
function tsDelta(m: Matrix, k: number): Matrix { return sub(m, tsShift(m, k)); }
function rolling(m: Matrix, w: number, f: (win: number[]) => number): Matrix {
  const nSym = m[0]?.length ?? 0;
  const out = m.map((r) => r.map(() => NaNv));
  const mp = Math.max(2, Math.floor(w / 2));
  for (let j = 0; j < nSym; j++)
    for (let i = w - 1; i < m.length; i++) {
      const win: number[] = [];
      let valid = 0;
      for (let k = 0; k < w; k++) { const x = m[i - k][j]; win.push(x); if (!isNaNv(x)) valid++; }
      if (valid >= mp) out[i][j] = f(win);
    }
  return out;
}
const mean = (a: number[]) => { const v = a.filter((x) => !isNaNv(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaNv; };
const std = (a: number[]) => { const v = a.filter((x) => !isNaNv(x)); if (v.length < 2) return NaNv; const m = v.reduce((s, x) => s + x, 0) / v.length; return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
function tsMean(m: Matrix, w: number) { return rolling(m, w, mean); }
function tsStd(m: Matrix, w: number) { return rolling(m, w, std); }
function tsRank(m: Matrix, w: number) {
  return rolling(m, w, (win) => { const cur = win[0]; const v = win.filter((x) => !isNaNv(x)); let less = 0, eq = 0; for (const x of v) { if (x < cur) less++; else if (x === cur) eq++; } return v.length <= 1 ? NaNv : (less + (eq + 1) / 2) / v.length; });
}
function decayLinear(m: Matrix, w: number): Matrix {
  const weights: number[] = []; let ws = 0;
  for (let k = 0; k < w; k++) { weights.push(w - k); ws += w - k; }
  for (let k = 0; k < w; k++) weights[k] /= ws;
  return rolling(m, w, (win) => { let acc = 0; for (let k = 0; k < w; k++) { if (isNaNv(win[k])) return NaNv; acc += win[k] * weights[k]; } return acc; });
}
function signedpow(m: Matrix, e: number): Matrix { return m.map((r) => r.map((x) => (isNaNv(x) ? NaNv : Math.sign(x) * Math.abs(x) ** e))); }
function correlation(a: Matrix, b: Matrix, w: number): Matrix {
  const nSym = a[0]?.length ?? 0;
  const out = a.map((r) => r.map(() => NaNv));
  const mp = Math.max(2, Math.floor(w / 2));
  for (let j = 0; j < nSym; j++)
    for (let i = w - 1; i < a.length; i++) {
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
      for (let k = 0; k < w; k++) { const x = a[i - k][j], y = b[i - k][j]; if (isNaNv(x) || isNaNv(y)) continue; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++; }
      if (n < mp) continue;
      const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
      const d = Math.sqrt(vx * vy);
      if (d > 0) out[i][j] = cov / d;
    }
  return out;
}

// ---- alpha library (real formulas) ----------------------------------------
interface LibAlpha { id: string; expression: string; rationale: string; by: string; fn: (f: Fields) => Matrix; }
const ALPHAS: LibAlpha[] = [
  { id: "a01", by: "llm", expression: "rank(ts_mean(returns, 5)) - rank(ts_mean(returns, 20))", rationale: "Fast-vs-slow momentum spread.", fn: (f) => sub(csRank(tsMean(f.returns, 5)), csRank(tsMean(f.returns, 20))) },
  { id: "a02", by: "llm", expression: "-1 * correlation(rank(close), rank(volume), 10)", rationale: "Price-volume divergence signals reversals.", fn: (f) => neg(correlation(csRank(f.close), csRank(f.volume), 10)) },
  { id: "a03", by: "llm", expression: "zscore(ts_mean(returns, 20))", rationale: "Standardised medium-term momentum.", fn: (f) => csZscore(tsMean(f.returns, 20)) },
  { id: "a04", by: "llm", expression: "rank(ts_std(returns, 20)) * -1", rationale: "Low-volatility anomaly.", fn: (f) => neg(csRank(tsStd(f.returns, 20))) },
  { id: "a05", by: "template", expression: "-1 * delta(vwap, 3)", rationale: "VWAP mean-reversion.", fn: (f) => neg(tsDelta(f.vwap, 3)) },
  { id: "a06", by: "llm", expression: "decay_linear(rank(returns), 5)", rationale: "Recency-weighted momentum.", fn: (f) => decayLinear(csRank(f.returns), 5) },
  { id: "a07", by: "llm", expression: "-1 * ts_rank(returns, 10)", rationale: "Medium-horizon reversal.", fn: (f) => neg(tsRank(f.returns, 10)) },
  { id: "a08", by: "llm", expression: "rank(dollar_volume) * sign(ts_mean(returns, 10))", rationale: "Liquidity-weighted momentum.", fn: (f) => mul(csRank(f.dollar_volume), sign(tsMean(f.returns, 10))) },
  { id: "a09", by: "template", expression: "-1 * signedpower(delta(close, 5), 0.5)", rationale: "Damped 5-day reversal.", fn: (f) => neg(signedpow(tsDelta(f.close, 5), 0.5)) },
  { id: "a10", by: "llm", expression: "correlation(close, ts_mean(close, 5), 10)", rationale: "Trend persistence vs moving average.", fn: (f) => correlation(f.close, tsMean(f.close, 5), 10) },
  { id: "a11", by: "template", expression: "rank(delta(volume, 1)) * -1 * sign(delta(close, 1))", rationale: "Volume shocks against price fade.", fn: (f) => mul(csRank(tsDelta(f.volume, 1)), neg(sign(tsDelta(f.close, 1)))) },
  { id: "a12", by: "template", expression: "-1 * delta(close, 1)", rationale: "Short-term reversal.", fn: (f) => neg(tsDelta(f.close, 1)) },
];

// ---- metrics ---------------------------------------------------------------
const TD = 252;
function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.sign(x) * y;
}
const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
function normPpf(p: number) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= 1 - pl) { const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
function sharpe(r: number[]) { const v = r.filter((x) => !isNaNv(x)); const s = std(v); return v.length < 2 || !s ? 0 : (Math.sqrt(TD) * mean(v)) / s; }
function maxDrawdown(r: number[]) { let eq = 1, peak = 1, mdd = 0; for (const x of r) { eq *= 1 + x; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); } return mdd; }
function moment(r: number[], p: number) { const m = mean(r), s = std(r); if (!s) return p === 4 ? 3 : 0; return r.reduce((a, x) => a + ((x - m) / s) ** p, 0) / r.length; }
function deflatedSharpe(sr: number, n: number, trials: number, sk: number, ku: number) {
  if (n < 2 || trials < 1) return 0;
  const s = sr / Math.sqrt(TD), emc = 0.5772156649;
  const z1 = normPpf(1 - 1 / trials), z2 = normPpf(1 - 1 / (trials * Math.E));
  const emax = (1 - emc) * z1 + emc * z2;
  const v = (1 - sk * s + ((ku - 1) / 4) * s * s) / (n - 1);
  const sd = Math.sqrt(Math.max(v, 1e-12));
  return normCdf((s - emax * sd) / sd);
}
function ic(signal: Matrix, fwd: Matrix): [number, number] {
  const sr = csRank(signal), fr = csRank(fwd); const ics: number[] = [];
  for (let i = 0; i < sr.length; i++) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
    for (let j = 0; j < sr[i].length; j++) { const x = sr[i][j], y = fr[i][j]; if (isNaNv(x) || isNaNv(y)) continue; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++; }
    if (n < 3) continue; const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n, d = Math.sqrt(vx * vy); if (d > 0) ics.push(cov / d);
  }
  const m = mean(ics), s = std(ics); return [m || 0, s ? m / s : 0];
}

// ---- backtest --------------------------------------------------------------
function signalToWeights(sig: Matrix): Matrix { return csScale(csDemean(sig)); }
function backtest(sig: Matrix, fwd: Matrix, dates: string[], costBps: number, trials: number, id: string) {
  const w = signalToWeights(sig);
  const ret: number[] = [], rdates: string[] = [];
  let toSum = 0, toN = 0;
  for (let i = 0; i < w.length; i++) {
    let gross = 0, any = false, turn = 0;
    for (let j = 0; j < w[i].length; j++) {
      const wi = w[i][j], r = fwd[i][j];
      if (!isNaNv(wi) && !isNaNv(r)) { gross += wi * r; any = true; }
      const prev = i === 0 ? 0 : w[i - 1][j]; turn += Math.abs((isNaNv(wi) ? 0 : wi) - (isNaNv(prev) ? 0 : prev));
    }
    if (!any) continue;
    ret.push(gross - turn * (costBps / 1e4)); rdates.push(dates[i]); toSum += turn; toN++;
  }
  const [icMean, icIr] = ic(sig, fwd);
  const m: AlphaMetrics = {
    alpha_id: id, sharpe: sharpe(ret), ann_return: mean(ret) * TD, ann_vol: std(ret) * Math.sqrt(TD) || 0,
    max_drawdown: maxDrawdown(ret), turnover: toN ? toSum / toN : 0, ic_mean: icMean, ic_ir: icIr,
    n_obs: ret.length, deflated_sharpe: deflatedSharpe(sharpe(ret), ret.length, trials, moment(ret, 3), moment(ret, 4)),
  };
  const equity: number[] = []; let cum = 1; for (const r of ret) { cum *= 1 + r; equity.push(cum); }
  return { metrics: m, returns: ret, dates: rdates, equity };
}

const sliceRows = (m: Matrix, a: number, b: number) => m.slice(a, b);

// ---- pipeline --------------------------------------------------------------
export function runDiscovery(seed = 42, nAlphas = 12): DiscoveryRun {
  const f = syntheticFields(seed, 1000);
  const split = Math.floor(f.dates.length * 0.6);
  const chosen = ALPHAS.slice(0, Math.min(nAlphas, ALPHAS.length));
  const trials = chosen.length;

  const evaluated: EvaluatedAlpha[] = [];
  const candReturns: Record<string, { dates: string[]; returns: number[] }> = {};
  const outSignals: Record<string, Matrix> = {};

  for (const a of chosen) {
    const full = a.fn(f);
    const sigIn = sliceRows(full, 0, split), fwdIn = sliceRows(f.forward, 0, split), dIn = f.dates.slice(0, split);
    const sigOut = sliceRows(full, split, f.dates.length), fwdOut = sliceRows(f.forward, split, f.dates.length), dOut = f.dates.slice(split);
    const btIn = backtest(sigIn, fwdIn, dIn, 5, trials, a.id);
    const btOut = backtest(sigOut, fwdOut, dOut, 5, 1, a.id);
    evaluated.push({
      expression: { id: a.id, expression: a.expression, rationale: a.rationale, proposed_by: a.by, created_at: new Date().toISOString() },
      in_sample: btIn.metrics, out_sample: btOut.metrics, selected: false, reject_reason: "",
      risk_score: Math.max(0, Math.min(1, 0.5 + btOut.metrics.sharpe / 3)),
    });
    candReturns[a.id] = { dates: btIn.dates, returns: btIn.returns };
    outSignals[a.id] = sigOut;
  }

  // selection: significance + decorrelation
  evaluated.sort((x, y) => y.in_sample.deflated_sharpe - x.in_sample.deflated_sharpe || y.in_sample.sharpe - x.in_sample.sharpe);
  const accepted: EvaluatedAlpha[] = [];
  for (const e of evaluated) {
    if (e.in_sample.sharpe < 0.3) { e.reject_reason = `Sharpe ${e.in_sample.sharpe.toFixed(2)} below floor`; continue; }
    if (e.in_sample.deflated_sharpe < 0.6) { e.reject_reason = `Deflated Sharpe ${e.in_sample.deflated_sharpe.toFixed(2)} below floor`; continue; }
    let maxCorr = 0;
    for (const p of accepted) maxCorr = Math.max(maxCorr, Math.abs(corrByDate(candReturns[e.expression.id], candReturns[p.expression.id])));
    if (maxCorr > 0.7) { e.reject_reason = `Correlation ${maxCorr.toFixed(2)} with an accepted alpha`; continue; }
    e.selected = true; accepted.push(e);
  }

  // risk-parity allocation over selected
  const weights: Record<string, number> = {};
  let inv = 0;
  for (const e of accepted) { const v = e.in_sample.ann_vol || 1e-6; inv += 1 / v; }
  for (const e of accepted) weights[e.expression.id] = 1 / (e.in_sample.ann_vol || 1e-6) / inv;

  // out-of-sample portfolio backtest
  const dOut = f.dates.slice(split);
  const fwdOut = sliceRows(f.forward, split, f.dates.length);
  let result: DiscoveryRun["result"] = null;
  if (accepted.length) {
    let combined: Matrix | null = null;
    for (const e of accepted) {
      const contrib = signalToWeights(outSignals[e.expression.id]).map((r) => r.map((x) => x * weights[e.expression.id]));
      combined = combined ? mapMat2(combined, contrib, (x, y) => x + y) : contrib;
    }
    const port = backtest(combined as Matrix, fwdOut, dOut, 5, 1, "portfolio");
    result = {
      metrics: port.metrics, dates: port.dates, equity_curve: port.equity,
      allocation: { weights, method: "risk_parity", expected_sharpe: port.metrics.sharpe },
    };
  }

  // Overfitting & leakage firewall over the whole candidate family.
  const validation = computeValidation(candReturns, evaluated);
  const factor_correlation = correlationMatrix(alignReturns(candReturns));

  // Market-regime detection (Gaussian HMM) on the equal-weight market return.
  const mktRet: number[] = [];
  const mktDates: string[] = [];
  for (let i = 1; i < f.dates.length; i++) {
    let s = 0, c = 0;
    for (let j = 0; j < f.symbols.length; j++) {
      const r = f.returns[i][j];
      if (!Number.isNaN(r)) { s += r; c++; }
    }
    if (c > 0) { mktRet.push(s / c); mktDates.push(f.dates[i]); }
  }
  const regimes = detectRegimes(mktRet, mktDates);

  const now = new Date();
  return {
    run_id: `run_${now.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z_${seed}`,
    universe: f.symbols, start_date: f.dates[0], end_date: f.dates[f.dates.length - 1],
    n_proposed: evaluated.length, n_selected: accepted.length, alphas: evaluated, result, validation,
    factor_correlation, regimes,
    region: "uae-north", started_at: now.toISOString(), finished_at: new Date().toISOString(),
  };
}

function corrByDate(a: { dates: string[]; returns: number[] }, b: { dates: string[]; returns: number[] }) {
  const map = new Map<string, number>(); b.dates.forEach((d, i) => map.set(d, b.returns[i]));
  const xs: number[] = [], ys: number[] = [];
  a.dates.forEach((d, i) => { const y = map.get(d); if (y !== undefined) { xs.push(a.returns[i]); ys.push(y); } });
  if (xs.length < 10) return 0;
  const n = xs.length; let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; sxy += xs[i] * ys[i]; }
  const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n, d = Math.sqrt(vx * vy);
  return d > 0 ? cov / d : 0;
}
