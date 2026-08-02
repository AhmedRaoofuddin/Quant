#!/usr/bin/env node
/**
 * Standalone overfitting firewall: PBO/CSCV, PSR, deflated Sharpe, Holm haircut, bootstrap CI.
 *
 * Mirrors frontend/lib/validation.ts. No dependencies, no server required.
 *
 *   node firewall.mjs --returns returns.json
 *   node firewall.mjs --csv returns.csv
 *   node firewall.mjs --demo
 */

import { readFileSync } from "node:fs";

const TRADING_DAYS = 252;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

// ---------------------------------------------------------------- statistics

const mean = (x) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
const std = (x) => {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
};
const annSharpe = (x) => { const s = std(x); return s > 0 ? (mean(x) / s) * Math.sqrt(TRADING_DAYS) : 0; };
const moment = (x, k) => {
  const s = std(x); if (!(s > 0) || x.length < 3) return k === 3 ? 0 : 3;
  const m = mean(x);
  return x.reduce((a, v) => a + ((v - m) / s) ** k, 0) / x.length;
};

function normCdf(z) {
  // Abramowitz-Stegun 7.1.26 on erf.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
function normPpf(p) {
  // Acklam's rational approximation, plenty accurate for reporting.
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

const EULER = 0.5772156649015329;

/** P(true SR > benchmark) given sample length and the return distribution's shape. */
function probabilisticSharpe(sharpe, n, skew, kurt, benchmark = 0) {
  if (n < 2) return 0;
  const sr = sharpe / Math.sqrt(TRADING_DAYS);
  const sr0 = benchmark / Math.sqrt(TRADING_DAYS);
  const denom = Math.sqrt(Math.max(1 - skew * sr + ((kurt - 1) / 4) * sr * sr, 1e-9));
  return normCdf(((sr - sr0) * Math.sqrt(n - 1)) / denom);
}

/** Deflated Sharpe: PSR against the Sharpe you'd expect from N trials of pure noise. */
function deflatedSharpe(sharpe, n, skew, kurt, trials, varianceOfTrialSharpes) {
  const N = Math.max(trials, 2);
  const sigma = Math.sqrt(Math.max(varianceOfTrialSharpes, 1e-12));
  // Expected maximum of N draws (Bailey & Lopez de Prado 2014, eq. 8).
  const expectedMax = sigma * ((1 - EULER) * normPpf(1 - 1 / N) + EULER * normPpf(1 - 1 / (N * Math.E)));
  return probabilisticSharpe(sharpe, n, skew, kurt, expectedMax);
}

/** Minimum track record length, in years, for PSR to reach `target`. */
function minBacktestYears(sharpe, skew, kurt, target = 0.95) {
  const sr = sharpe / Math.sqrt(TRADING_DAYS);
  if (!(Math.abs(sr) > 1e-6)) return Infinity;
  const z = normPpf(target);
  return (1 + (1 - skew * sr + ((kurt - 1) / 4) * sr * sr) * (z / sr) ** 2) / TRADING_DAYS;
}

function combinations(n, k) {
  const out = [], combo = [];
  (function walk(start) {
    if (combo.length === k) { out.push(combo.slice()); return; }
    for (let i = start; i < n; i++) { combo.push(i); walk(i + 1); combo.pop(); }
  })(0);
  return out;
}

/** Combinatorially-symmetric cross-validation: probability of backtest overfitting. */
function cscvPbo(ids, matrix, S = 10) {
  const T = matrix.length, N = ids.length;
  if (T < S * 4 || N < 2) return { pbo: 0, lambdas: [], nCombos: 0, degradation: 1, bestId: ids[0] ?? "" };

  const size = Math.floor(T / S);
  const blocks = [];
  for (let s = 0; s < S; s++) {
    const start = s * size, end = s === S - 1 ? T : start + size;
    blocks.push(Array.from({ length: end - start }, (_, i) => start + i));
  }
  const sharpeOn = (rows, col) => annSharpe(rows.map((r) => matrix[r][col]).filter((v) => !Number.isNaN(v)));

  const lambdas = [], isS = [], oosS = [], bestCount = new Array(N).fill(0);
  for (const train of combinations(S, S / 2)) {
    const set = new Set(train);
    const trainRows = train.flatMap((b) => blocks[b]);
    const testRows = blocks.filter((_, i) => !set.has(i)).flat();
    const inS = ids.map((_, c) => sharpeOn(trainRows, c));
    const outS = ids.map((_, c) => sharpeOn(testRows, c));

    let best = 0;
    for (let c = 1; c < N; c++) if (inS[c] > inS[best]) best = c;
    bestCount[best]++;

    const rank = outS.filter((v) => v <= outS[best]).length;
    const omega = rank / (N + 1);
    lambdas.push(Math.log(omega / (1 - omega)));
    isS.push(inS[best]); oosS.push(outS[best]);
  }

  const mx = mean(isS), my = mean(oosS);
  let num = 0, den = 0;
  for (let i = 0; i < isS.length; i++) { num += (isS[i] - mx) * (oosS[i] - my); den += (isS[i] - mx) ** 2; }

  let bestId = ids[0], bc = -1;
  bestCount.forEach((c, i) => { if (c > bc) { bc = c; bestId = ids[i]; } });

  return {
    pbo: lambdas.filter((l) => l <= 0).length / lambdas.length,
    lambdas, nCombos: lambdas.length,
    degradation: den > 0 ? num / den : 0,
    bestId,
  };
}

/** Holm-Bonferroni step-down haircut on the best strategy's Sharpe. */
function holmHaircut(entries) {
  const items = entries
    .map(({ id, returns }) => {
      const T = Math.max(returns.length, 2);
      const sharpe = annSharpe(returns);
      const t = (sharpe / Math.sqrt(TRADING_DAYS)) * Math.sqrt(T);
      return { id, sharpe, t, p: 2 * (1 - normCdf(Math.abs(t))), T };
    })
    .filter((x) => x.sharpe > 0);
  if (!items.length) return { id: "", haircut: 0, pct: 0 };

  const N = items.length;
  let running = 0;
  const adj = new Map();
  [...items].sort((a, b) => a.p - b.p).forEach((it, k) => {
    running = Math.max(running, Math.min(1, (N - k) * it.p));
    adj.set(it.id, running);
  });

  const best = items.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  const pAdj = Math.min(Math.max(adj.get(best.id) ?? 1, 1e-10), 1);
  const tAdj = Math.min(normPpf(1 - pAdj / 2), 12);
  const haircut = Math.max(0, (tAdj / Math.sqrt(best.T)) * Math.sqrt(TRADING_DAYS));
  return { id: best.id, sharpe: best.sharpe, haircut, pct: Math.min(1, Math.max(0, 1 - haircut / best.sharpe)) };
}

const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** 95% CI on Sharpe via circular block bootstrap (blocks preserve autocorrelation). */
function bootstrapSharpeCI(returns, seed = 1234, B = 400) {
  const r = returns.filter((x) => !Number.isNaN(x)), T = r.length;
  if (T < 20) return [0, 0];
  const block = Math.max(2, Math.round(Math.sqrt(T)));
  const rand = rng(seed), out = [];
  for (let b = 0; b < B; b++) {
    const s = [];
    while (s.length < T) {
      const start = Math.floor(rand() * T);
      for (let i = 0; i < block && s.length < T; i++) s.push(r[(start + i) % T]);
    }
    out.push(annSharpe(s));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(0.025 * B)], out[Math.floor(0.975 * B)]];
}

/** Derate the trial count by average pairwise correlation: near-clones are not independent. */
function effectiveTrials(ids, matrix) {
  const N = ids.length;
  if (N < 2 || matrix.length < 10) return N;
  let sum = 0, pairs = 0;
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
    for (const row of matrix) {
      const x = row[a], y = row[b];
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; n++;
    }
    if (n < 5) continue;
    const d = Math.sqrt((sxx - sx * sx / n) * (syy - sy * sy / n));
    if (d > 0) { sum += Math.abs((sxy - sx * sy / n) / d); pairs++; }
  }
  const avg = pairs ? sum / pairs : 0;
  return Math.max(1, Math.min(N, 1 + (N - 1) * (1 - avg)));
}

// ---------------------------------------------------------------- input

function alignSeries(series) {
  const ids = Object.keys(series);
  const counts = new Map();
  for (const id of ids) for (const d of series[id].dates) counts.set(d, (counts.get(d) ?? 0) + 1);
  const dates = [...counts.entries()].filter(([, c]) => c === ids.length).map(([d]) => d).sort();
  const lookup = {};
  for (const id of ids) {
    const m = new Map();
    series[id].dates.forEach((d, i) => m.set(d, series[id].returns[i]));
    lookup[id] = m;
  }
  return { ids, dates, matrix: dates.map((d) => ids.map((id) => lookup[id].get(d) ?? Number.NaN)) };
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(",").map((s) => s.trim());
  const dateCol = head.findIndex((h) => /^date$/i.test(h));
  if (dateCol < 0) throw new Error("CSV needs a 'date' column.");
  const series = {};
  head.forEach((h, i) => { if (i !== dateCol) series[h] = { dates: [], returns: [] }; });
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const date = cells[dateCol].trim();
    head.forEach((h, i) => {
      if (i === dateCol) return;
      const v = parseFloat(cells[i]);
      if (Number.isFinite(v)) { series[h].dates.push(date); series[h].returns.push(v); }
    });
  }
  return series;
}

/** Pure-noise family: every "strategy" is random, so an honest firewall must call it overfit. */
function demoSeries() {
  const series = {}, T = 750;
  const dates = Array.from({ length: T }, (_, i) => `d${String(i).padStart(4, "0")}`);
  for (let s = 0; s < 8; s++) {
    const rand = rng(1000 + s * 37);
    const returns = Array.from({ length: T }, () => {
      // Box-Muller on the seeded stream.
      const u = Math.max(rand(), 1e-12), v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.01;
    });
    series[`noise-${s + 1}`] = { dates, returns };
  }
  return series;
}

let series;
try {
  if (argv.includes("--demo")) series = demoSeries();
  else if (arg("csv")) series = parseCsv(readFileSync(arg("csv"), "utf8"));
  else if (arg("returns")) series = JSON.parse(readFileSync(arg("returns"), "utf8"));
  else { console.error("Pass --returns <json> | --csv <file> | --demo"); process.exit(1); }
} catch (e) {
  console.error(`Could not read input: ${e.message}`);
  process.exit(1);
}

const ids = Object.keys(series);
if (ids.length < 2) {
  console.error("PBO needs the whole family of strategies you tried, not just the winner.");
  console.error("Supply at least 2 series. Running it on one is meaningless.");
  process.exit(1);
}

// ---------------------------------------------------------------- run

const { dates, matrix } = alignSeries(series);
if (dates.length < 60) { console.error(`Only ${dates.length} common observations. Need >= 60.`); process.exit(1); }

const S = 10;
const { pbo, nCombos, degradation, bestId } = cscvPbo(ids, matrix, S);
const eff = effectiveTrials(ids, matrix);
const cut = holmHaircut(ids.map((id) => ({ id, returns: series[id].returns })));

const trialSharpes = ids.map((id) => annSharpe(series[id].returns));
const sharpeVar = trialSharpes.length > 1 ? std(trialSharpes) ** 2 : 1e-6;

const rows = ids.map((id) => {
  const r = series[id].returns;
  const sh = annSharpe(r), sk = moment(r, 3), ku = moment(r, 4);
  return {
    id, sharpe: sh,
    psr: probabilisticSharpe(sh, r.length, sk, ku),
    dsr: deflatedSharpe(sh, r.length, sk, ku, eff, sharpeVar),
    minYears: minBacktestYears(sh, sk, ku),
    years: r.length / TRADING_DAYS,
  };
}).sort((a, b) => b.sharpe - a.sharpe);

const ci = bootstrapSharpeCI(series[bestId].returns);
const verdict = pbo <= 0.2 ? "ROBUST" : pbo <= 0.5 ? "FRAGILE" : "OVERFIT";
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

console.log(`\nBacktest firewall  (${ids.length} strategies, ${dates.length} obs, ${nCombos} CSCV splits)`);
console.log("=".repeat(72));
console.log(`VERDICT               ${verdict}`);
console.log(`Probability of backtest overfitting   ${pct(pbo)}`);
console.log(`Effective independent trials          ${eff.toFixed(1)} of ${ids.length}`);
console.log(`OOS-vs-IS Sharpe slope                ${degradation.toFixed(2)}  ${degradation < 0 ? "(negative: winners reverse)" : ""}`);
console.log(`Most-selected strategy                ${bestId}`);
console.log(`  95% bootstrap CI on its Sharpe      [${ci[0].toFixed(2)}, ${ci[1].toFixed(2)}]${ci[0] <= 0 ? "  <- includes zero" : ""}`);
console.log(`Holm haircut on best Sharpe           ${cut.sharpe?.toFixed(2)} -> ${cut.haircut.toFixed(2)}  (${pct(cut.pct)} removed)`);
console.log("-".repeat(72));
console.log("STRATEGY               SHARPE     PSR     DSR   MIN YRS   HAVE");
for (const r of rows) {
  console.log(
    `${r.id.slice(0, 20).padEnd(20)} ${r.sharpe.toFixed(2).padStart(7)} ` +
    `${pct(r.psr).padStart(7)} ${pct(r.dsr).padStart(7)} ` +
    `${(Number.isFinite(r.minYears) ? r.minYears.toFixed(1) : "inf").padStart(9)} ${r.years.toFixed(1).padStart(6)}`
  );
}
console.log("-".repeat(72));
if (pbo > 0.5) console.log("The best in-sample strategy lands below the OOS median more often than not.\nSelection among these is worse than random. Do not deploy the winner.");
else if (pbo > 0.2) console.log("Selection is partly luck. Shrink expectations toward the family median.");
else console.log("Ranking survives resampling. Check capacity before funding (see strategy-capacity).");
console.log("");
