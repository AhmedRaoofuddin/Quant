#!/usr/bin/env node
/**
 * Cross-sectional strategy backtester with per-strategy capacity.
 *
 * Mirrors frontend/lib/strategies.ts. Scores at time t see prices up to t; the return earned runs
 * t -> t+1. Scoring rules are declarative expression trees evaluated by a whitelisted interpreter,
 * never eval'd, so a model-written strategy cannot execute arbitrary code.
 *
 *   node backtest.mjs --prices prices.csv
 *   node backtest.mjs --prices prices.csv --strategies mine.json --emit-returns returns.json
 *   node backtest.mjs --list-ops
 *   node backtest.mjs --demo
 */

import { readFileSync, writeFileSync } from "node:fs";

const TRADING_DAYS = 252;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const num = (n, d) => { const v = parseFloat(arg(n, "")); return Number.isFinite(v) ? v : d; };

// ---------------------------------------------------------------- stats

const mean = (x) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
const std = (x) => {
  if (x.length < 2) return 0;
  const m = mean(x);
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
};

// ---------------------------------------------------------------- score grammar

/**
 * Whitelisted primitives. Each receives the price history up to and including t, so no op can
 * reach past the decision point. Adding an op means preserving that boundary.
 */
const OPS = {
  ret: {
    doc: "trailing return over `lookback`, optionally skipping the last `skip` periods",
    args: ["lookback", "skip?"],
    fn: (h, n) => {
      const s = n.skip ? h.slice(0, -n.skip) : h;
      const k = n.lookback ?? 20;
      return s.length > k && s[s.length - 1 - k] > 0 ? s[s.length - 1] / s[s.length - 1 - k] - 1 : 0;
    },
  },
  vol: {
    doc: "trailing volatility of period returns over `lookback`",
    args: ["lookback"],
    fn: (h, n) => {
      const k = n.lookback ?? 20, r = [];
      for (let i = Math.max(1, h.length - k); i < h.length; i++) if (h[i - 1] > 0) r.push(h[i] / h[i - 1] - 1);
      return r.length > 2 ? std(r) : 1;
    },
  },
  maGap: {
    doc: "price relative to its own moving average over `lookback`",
    args: ["lookback"],
    fn: (h, n) => {
      const k = n.lookback ?? 50;
      if (h.length < k) return 0;
      const ma = mean(h.slice(-k));
      return ma > 0 ? h[h.length - 1] / ma - 1 : 0;
    },
  },
  drawdown: {
    doc: "distance below the trailing peak over `lookback` (negative)",
    args: ["lookback"],
    fn: (h, n) => {
      const w = h.slice(-(n.lookback ?? 60));
      const peak = Math.max(...w);
      return peak > 0 ? w[w.length - 1] / peak - 1 : 0;
    },
  },
  const: { doc: "scalar literal", args: ["value"], fn: (_h, n) => n.value ?? 0 },
  neg: { doc: "negate `a`", args: ["a"], unary: true, fn: (v) => -v },
  add: { doc: "`a` + `b`", args: ["a", "b"], binary: true, fn: (x, y) => x + y },
  sub: { doc: "`a` - `b`", args: ["a", "b"], binary: true, fn: (x, y) => x - y },
  mul: { doc: "`a` * `b`", args: ["a", "b"], binary: true, fn: (x, y) => x * y },
  div: { doc: "`a` / `b`, guarded against zero", args: ["a", "b"], binary: true, fn: (x, y) => x / (Math.abs(y) > 1e-9 ? y : 1e-9) },
};

/** Reject anything outside the grammar before it runs. Same contract as dsl::validate in C++. */
function validateScore(node, path = "score") {
  if (node === null || typeof node !== "object" || Array.isArray(node)) throw new Error(`${path}: expected an op object`);
  const op = OPS[node.op];
  if (!op) throw new Error(`${path}: unknown op "${node.op}". Known: ${Object.keys(OPS).join(", ")}`);
  if (op.unary) validateScore(node.a, `${path}.a`);
  if (op.binary) { validateScore(node.a, `${path}.a`); validateScore(node.b, `${path}.b`); }
  return true;
}

function evalScore(node, hist) {
  const op = OPS[node.op];
  if (op.unary) return op.fn(evalScore(node.a, hist));
  if (op.binary) return op.fn(evalScore(node.a, hist), evalScore(node.b, hist));
  return op.fn(hist, node);
}

const BUILT_INS = [
  { id: "momentum", name: "Cross-sectional momentum", rebalanceEvery: 8, holdings: 10,
    thesis: "Buy strong trailing performers, skipping the last period to dodge short-term reversal.",
    score: { op: "ret", lookback: 60, skip: 1 } },
  { id: "lowvol", name: "Low volatility", rebalanceEvery: 20, holdings: 12,
    thesis: "The low-volatility anomaly: calmer names deliver better risk-adjusted returns.",
    score: { op: "neg", a: { op: "vol", lookback: 60 } } },
  { id: "reversal", name: "Short-term reversal", rebalanceEvery: 2, holdings: 10,
    thesis: "Recent losers bounce. High turnover, first to be destroyed by trading costs.",
    score: { op: "neg", a: { op: "ret", lookback: 3 } } },
  { id: "trend", name: "Trend following", rebalanceEvery: 12, holdings: 12,
    thesis: "Hold names above their own long moving average; persistence rather than ranking.",
    score: { op: "maGap", lookback: 50 } },
  { id: "quality", name: "Risk-adjusted momentum", rebalanceEvery: 8, holdings: 10,
    thesis: "Momentum scaled by volatility, so the book is not dominated by violent names.",
    score: { op: "div", a: { op: "ret", lookback: 60, skip: 1 }, b: { op: "vol", lookback: 60 } } },
  { id: "dipbuy", name: "Drawdown recovery", rebalanceEvery: 10, holdings: 10,
    thesis: "Buy quality names furthest below their trailing peak, betting on mean reversion.",
    score: { op: "drawdown", lookback: 120 } },
];

// ---------------------------------------------------------------- capacity

const CAPACITY_DEFAULTS = { eta: 0.55, participationCap: 0.1, feeBps: 0.5 };

function analyseCapacity(book, a) {
  const gross = book.reduce((s, p) => s + Math.abs(p.weight), 0);
  const w = book.map((p) => ({ ...p, weight: Math.abs(p.weight) / gross }));

  const costAt = (aum) => {
    let cost = 0, breach = false;
    for (const p of w) {
      const participation = (aum * p.weight) / Math.max(p.advUsd, 1);
      if (participation > a.participationCap) breach = true;
      cost += p.weight * (0.5 * p.spreadBps + a.eta * p.dailyVol * Math.sqrt(participation) * 1e4 + a.feeBps);
    }
    return { costBps: 2 * cost, breach };
  };
  const netAt = (aum) => a.grossAnnReturn - (costAt(aum).costBps / 1e4) * a.annualTurnover;

  const solve = (lo, hi, f) => {
    if (f(lo) <= 0) return lo;
    if (f(hi) > 0) return hi;
    for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); if (f(m) > 0) lo = m; else hi = m; }
    return Math.sqrt(lo * hi);
  };

  const MIN = 1e6, MAX = 5e10, STEPS = 60;
  const capHalf = solve(MIN, MAX, (x) => netAt(x) - 0.5 * a.grossAnnReturn);
  const capZero = solve(MIN, MAX, (x) => netAt(x));

  let liquidity = 0, peakAum = MIN, peakPnl = -Infinity;
  const ratio = Math.pow(MAX / MIN, 1 / (STEPS - 1));
  for (let i = 0, aum = MIN; i < STEPS; i++, aum *= ratio) {
    const c = costAt(aum);
    const pnl = (a.grossAnnReturn - (c.costBps / 1e4) * a.annualTurnover) * aum;
    if (pnl > peakPnl) { peakPnl = pnl; peakAum = aum; }
    if (c.breach && !liquidity) liquidity = aum;
  }

  const unbounded = capHalf >= MAX * 0.999;
  const liquidityBinds = liquidity > 0 && (unbounded || liquidity < capHalf);
  return {
    capacityAtHalfSharpe: capHalf, capacityAtZeroAlpha: capZero,
    liquidityLimitedAum: liquidity, peakNetPnlAum: peakAum, peakNetPnlUsd: peakPnl,
    bindingConstraint: liquidityBinds ? "liquidity" : "impact",
    deployableCapacity: liquidityBinds ? liquidity : capHalf,
    impactCapacityUnbounded: unbounded,
  };
}

// ---------------------------------------------------------------- backtest

function runStrategy(def, panel, liquidity) {
  const { symbols, dates, prices } = panel;   // prices[sym] = number[]
  const T = dates.length;
  const warmup = Math.min(60, Math.floor(T * 0.2));
  const usable = symbols.filter((s) => prices[s].filter((v) => v > 0).length === T);
  if (usable.length < def.holdings + 2) return null;

  let held = [];
  const periodReturns = [], retDates = [];
  let turnoverEvents = 0, turnoverSum = 0;

  for (let t = warmup; t < T - 1; t++) {
    if ((t - warmup) % def.rebalanceEvery === 0) {
      const ranked = usable
        .map((s) => ({ s, v: evalScore(def.score, prices[s].slice(0, t + 1)) }))
        .filter((x) => Number.isFinite(x.v))
        .sort((x, y) => y.v - x.v)
        .slice(0, def.holdings)
        .map((x) => x.s);
      if (held.length) {
        turnoverSum += 1 - ranked.filter((s) => held.includes(s)).length / def.holdings;
        turnoverEvents++;
      }
      held = ranked;
    }
    if (!held.length) continue;

    let acc = 0, n = 0;
    for (const s of held) {
      const p = prices[s];
      if (p[t] > 0 && p[t + 1] > 0) { acc += p[t + 1] / p[t] - 1; n++; }
    }
    if (n) { periodReturns.push(acc / n); retDates.push(dates[t + 1]); }
  }
  if (periodReturns.length < 20) return null;

  const periodsPerYear = num("periods-per-year", TRADING_DAYS);
  const grossAnnReturn = mean(periodReturns) * periodsPerYear;
  const annVol = std(periodReturns) * Math.sqrt(periodsPerYear);
  const grossSharpe = annVol > 0 ? grossAnnReturn / annVol : 0;

  let cum = 1, peak = 1, mdd = 0;
  const equity = [];
  for (const r of periodReturns) {
    cum *= 1 + r; equity.push(cum);
    peak = Math.max(peak, cum); mdd = Math.min(mdd, cum / peak - 1);
  }

  const avgTurnover = turnoverEvents ? turnoverSum / turnoverEvents : 1;
  const annualTurnover = Math.max(0.5, (periodsPerYear / def.rebalanceEvery) * avgTurnover);

  const book = held.map((s) => {
    const L = liquidity?.[s] ?? {};
    const dailyVol = L.dailyVol ?? std(
      prices[s].slice(-120).map((v, i, a2) => (i && a2[i - 1] > 0 ? v / a2[i - 1] - 1 : 0)).slice(1)
    );
    return { symbol: s, weight: 1, advUsd: L.advUsd ?? 5e8, dailyVol: dailyVol || 0.015, spreadBps: L.spreadBps ?? 3 };
  });

  const capacity = analyseCapacity(book, {
    ...CAPACITY_DEFAULTS,
    grossAnnReturn, annVol: Math.max(annVol, 1e-4), annualTurnover,
  });

  return {
    id: def.id, name: def.name, thesis: def.thesis ?? "",
    holdings: def.holdings, rebalanceEvery: def.rebalanceEvery,
    grossAnnReturn, annVol, grossSharpe, maxDrawdown: mdd, annualTurnover,
    periodReturns, dates: retDates, equity, book, capacity,
  };
}

// ---------------------------------------------------------------- input

function parsePriceCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(",").map((s) => s.trim());
  const dateCol = head.findIndex((h) => /^date$/i.test(h));
  if (dateCol < 0) throw new Error("Price CSV needs a 'date' column.");
  const symbols = head.filter((_, i) => i !== dateCol);
  const prices = Object.fromEntries(symbols.map((s) => [s, []]));
  const dates = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    dates.push(c[dateCol].trim());
    head.forEach((h, i) => { if (i !== dateCol) prices[h].push(parseFloat(c[i]) || 0); });
  }
  return { symbols, dates, prices };
}

/** Correlated GBM panel: a market factor plus idiosyncratic noise and per-name drift. */
function demoPanel() {
  let seed = 20260802;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());

  const T = 760, N = 24;
  const symbols = Array.from({ length: N }, (_, i) => `SYM${String(i + 1).padStart(2, "0")}`);
  const dates = Array.from({ length: T }, (_, i) => `d${String(i).padStart(4, "0")}`);
  const beta = symbols.map(() => 0.5 + rand() * 1.2);
  const idio = symbols.map(() => 0.006 + rand() * 0.018);
  const drift = symbols.map(() => (rand() - 0.45) * 0.0006);
  const prices = Object.fromEntries(symbols.map((s) => [s, [100]]));

  for (let t = 1; t < T; t++) {
    const mkt = 0.0003 + 0.009 * gauss();
    symbols.forEach((s, i) => {
      const r = drift[i] + beta[i] * mkt + idio[i] * gauss();
      prices[s].push(Math.max(prices[s][t - 1] * (1 + r), 0.01));
    });
  }
  const liquidity = Object.fromEntries(symbols.map((s, i) => [s, {
    advUsd: 2e8 * Math.pow(10, rand() * 1.6), dailyVol: idio[i] + 0.008, spreadBps: 0.8 + rand() * 3,
  }]));
  return { panel: { symbols, dates, prices }, liquidity };
}

// ---------------------------------------------------------------- main

if (argv.includes("--list-ops")) {
  console.log("\nScore grammar (whitelisted, never eval'd)\n" + "=".repeat(56));
  for (const [name, op] of Object.entries(OPS)) {
    console.log(`${name.padEnd(10)} ${op.args.join(", ").padEnd(18)} ${op.doc}`);
  }
  console.log("");
  process.exit(0);
}

let panel, liquidity = null;
try {
  if (argv.includes("--demo")) ({ panel, liquidity } = demoPanel());
  else if (arg("prices")) {
    panel = parsePriceCsv(readFileSync(arg("prices"), "utf8"));
    if (arg("liquidity")) liquidity = JSON.parse(readFileSync(arg("liquidity"), "utf8"));
  } else { console.error("Pass --prices <csv> | --demo   (--list-ops to see the grammar)"); process.exit(1); }
} catch (e) { console.error(`Could not read input: ${e.message}`); process.exit(1); }

let defs = BUILT_INS;
if (arg("strategies")) {
  try {
    defs = JSON.parse(readFileSync(arg("strategies"), "utf8"));
    if (!Array.isArray(defs) || !defs.length) throw new Error("expected a non-empty array");
    defs.forEach((d, i) => {
      if (!d.id) throw new Error(`strategy ${i}: missing id`);
      d.rebalanceEvery = Math.max(1, d.rebalanceEvery ?? 10);
      d.holdings = Math.max(2, d.holdings ?? 10);
      validateScore(d.score, `${d.id}.score`);
    });
  } catch (e) { console.error(`Invalid strategy file: ${e.message}`); process.exit(1); }
}

if (panel.dates.length < 120) { console.error(`Only ${panel.dates.length} rows. Need >= 120.`); process.exit(1); }

const results = defs.map((d) => runStrategy(d, panel, liquidity)).filter(Boolean);
if (!results.length) { console.error("No strategy produced enough history. Check the panel."); process.exit(1); }

const usd = (v) => !Number.isFinite(v) ? "n/a"
  : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

const bySharpe = [...results].sort((a, b) => b.grossSharpe - a.grossSharpe);
const byCap = [...results].sort((a, b) => b.capacity.deployableCapacity - a.capacity.deployableCapacity);

console.log(`\nStrategy family  (${results.length} strategies, ${panel.symbols.length} names, ${panel.dates.length} periods)`);
console.log("=".repeat(84));
console.log("STRATEGY                 SHARPE   ANN RET      VOL   MAX DD  TURNOVER   DEPLOYABLE      BINDS");
for (const r of bySharpe) {
  console.log(
    `${r.name.slice(0, 24).padEnd(24)} ${r.grossSharpe.toFixed(2).padStart(6)} ` +
    `${pct(r.grossAnnReturn).padStart(9)} ${pct(r.annVol).padStart(8)} ${pct(r.maxDrawdown).padStart(8)} ` +
    `${(r.annualTurnover.toFixed(1) + "x").padStart(9)} ${usd(r.capacity.deployableCapacity).padStart(12)} ` +
    `${r.capacity.bindingConstraint.padStart(10)}`
  );
}
console.log("-".repeat(84));

const bestSharpe = bySharpe[0], bestCap = byCap[0], worstCap = byCap[byCap.length - 1];
const capOf = (r) => r.capacity.deployableCapacity;

console.log(`Sharpe leader   ${bestSharpe.name}: ${bestSharpe.grossSharpe.toFixed(2)} Sharpe, ${usd(capOf(bestSharpe))} deployable`);

// A "capacity leader" is only news if it actually carries materially more than the Sharpe leader.
// Equal-weight books over a similar universe frequently tie on the same participation bound.
if (capOf(bestCap) > capOf(bestSharpe) * 1.25) {
  console.log(`Capacity leader ${bestCap.name}: ${bestCap.grossSharpe.toFixed(2)} Sharpe, ${usd(capOf(bestCap))} deployable`);
  console.log(`\nThe rankings disagree. At size the capacity leader is usually the better business.`);
} else {
  console.log(`No strategy here carries materially more than the Sharpe leader; the family shares a`);
  console.log(`liquidity bound, so capacity does not separate the top names.`);
}

// The real lesson lives at the bottom of the capacity column.
if (capOf(worstCap) < capOf(bestCap) * 0.25) {
  console.log(`\n${worstCap.name} is the cautionary case: ${worstCap.grossSharpe.toFixed(2)} Sharpe but only`);
  console.log(`${usd(capOf(worstCap))} deployable, bound by ${worstCap.capacity.bindingConstraint}, because it turns over`);
  console.log(`${worstCap.annualTurnover.toFixed(1)}x a year. Cost scales with turnover; alpha does not.`);
}

if (arg("emit-returns")) {
  const out = Object.fromEntries(results.map((r) => [r.id, { dates: r.dates, returns: r.periodReturns }]));
  writeFileSync(arg("emit-returns"), JSON.stringify(out, null, 2));
  console.log(`\nWrote ${arg("emit-returns")}. Now run the firewall on the family:`);
  console.log(`  node .claude/skills/backtest-firewall/scripts/firewall.mjs --returns ${arg("emit-returns")}`);
}
console.log("\nGross of costs. Survivorship bias lives in the price panel, not the code.\n");
