#!/usr/bin/env node
/**
 * Standalone strategy-capacity calculator.
 *
 * Mirrors backend/src/capacity/CapacityModel.cpp so the skill works with no server running and
 * no dependencies. Prints a capacity curve, the deployable size, and the binding constraint.
 *
 *   node capacity.mjs --gross-return 0.2 --vol 0.1 --turnover 12 --book '[...]'
 *   node capacity.mjs --demo
 */

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const num = (name, dflt) => {
  const v = parseFloat(arg(name, ""));
  return Number.isFinite(v) ? v : dflt;
};

const DEMO_BOOK = [
  { symbol: "AAPL", weight: 1, advUsd: 8.0e9, dailyVol: 0.016, spreadBps: 1.0 },
  { symbol: "MSFT", weight: 1, advUsd: 6.5e9, dailyVol: 0.015, spreadBps: 1.0 },
  { symbol: "NVDA", weight: 1, advUsd: 30e9, dailyVol: 0.030, spreadBps: 1.6 },
  { symbol: "JPM", weight: 1, advUsd: 2.7e9, dailyVol: 0.014, spreadBps: 0.9 },
  { symbol: "XOM", weight: 1, advUsd: 1.8e9, dailyVol: 0.015, spreadBps: 1.2 },
];

const a = {
  grossAnnReturn: num("gross-return", 0.2),
  annVol: num("vol", 0.1),
  annualTurnover: num("turnover", 12),
  eta: num("eta", 0.55),
  participationCap: num("cap", 0.1),
  feeBps: num("fees", 0.5),
};

let book;
try {
  book = argv.includes("--demo") ? DEMO_BOOK : JSON.parse(arg("book", JSON.stringify(DEMO_BOOK)));
} catch {
  console.error("Could not parse --book. Expect JSON: [{symbol,weight,advUsd,dailyVol,spreadBps}]");
  process.exit(1);
}
if (!Array.isArray(book) || !book.length) { console.error("Empty book."); process.exit(1); }
if (!(a.annVol > 0)) { console.error("--vol must be positive."); process.exit(1); }

// Normalise weights to sum to 1 in absolute terms.
const gross = book.reduce((s, p) => s + Math.abs(p.weight ?? 1), 0);
book = book.map((p) => ({ ...p, weight: Math.abs(p.weight ?? 1) / gross }));

function costBps(aum) {
  let cost = 0, part = 0, breach = false;
  for (const p of book) {
    const notional = aum * p.weight;
    const adv = Math.max(p.advUsd, 1);
    const participation = notional / adv;
    if (participation > a.participationCap) breach = true;
    const impact = a.eta * p.dailyVol * Math.sqrt(participation) * 1e4;
    cost += p.weight * (0.5 * p.spreadBps + impact + a.feeBps);
    part += p.weight * participation;
  }
  return { costBps: 2 * cost, participation: part, breach };
}

const netReturnAt = (aum) => a.grossAnnReturn - (costBps(aum).costBps / 1e4) * a.annualTurnover;

function solveCrossing(lo, hi, f) {
  if (f(lo) <= 0) return lo;
  if (f(hi) > 0) return hi;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

const MIN = 1e6, MAX = 5e10, STEPS = 60;
const grossSharpe = a.grossAnnReturn / a.annVol;
const half = 0.5 * a.grossAnnReturn;
const capHalf = solveCrossing(MIN, MAX, (x) => netReturnAt(x) - half);
const capZero = solveCrossing(MIN, MAX, (x) => netReturnAt(x));

let liquidityLimited = 0, peakAum = MIN, peakPnl = -Infinity;
const curve = [];
const ratio = Math.pow(MAX / MIN, 1 / (STEPS - 1));
for (let i = 0, aum = MIN; i < STEPS; i++, aum *= ratio) {
  const c = costBps(aum);
  const net = a.grossAnnReturn - (c.costBps / 1e4) * a.annualTurnover;
  const pnl = net * aum;
  if (pnl > peakPnl) { peakPnl = pnl; peakAum = aum; }
  if (c.breach && !liquidityLimited) liquidityLimited = aum;
  curve.push({ aum, participation: c.participation, costBps: c.costBps, netSharpe: net / a.annVol });
}

const unbounded = capHalf >= MAX * 0.999;
const liquidityBinds = liquidityLimited > 0 && (unbounded || liquidityLimited < capHalf);
const deployable = liquidityBinds ? liquidityLimited : capHalf;

const usd = (v) => !Number.isFinite(v) ? "n/a"
  : v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;

console.log(`\nStrategy capacity  (${book.length} names, turnover ${a.annualTurnover}x/yr, eta ${a.eta})`);
console.log("=".repeat(64));
console.log(`Gross Sharpe          ${grossSharpe.toFixed(2)}`);
console.log(`Deployable capacity   ${usd(deployable)}   <- headline`);
console.log(`  bound by            ${liquidityBinds ? "liquidity (ADV cap)" : "market impact"}`);
console.log(`Half-Sharpe capacity  ${usd(capHalf)}${unbounded ? "  (floor: impact never bit)" : ""}`);
// A figure pinned to the sweep bound is a floor, not an answer. Say so rather than quoting it.
console.log(`Alpha reaches zero    ${capZero >= MAX * 0.999 ? `> ${usd(MAX)}  (never, inside the sweep)` : usd(capZero)}`);
console.log(`Peak dollar P&L       ${usd(peakPnl)} at ${usd(peakAum)} AUM`);
console.log("-".repeat(64));
console.log("AUM          participation   round-trip cost   net Sharpe");
for (const p of curve.filter((_, i) => i % 8 === 0)) {
  console.log(
    `${usd(p.aum).padEnd(12)} ${(p.participation * 100).toFixed(2).padStart(8)}%   ` +
    `${p.costBps.toFixed(1).padStart(10)}bp   ${p.netSharpe.toFixed(2).padStart(10)}`
  );
}
console.log("\nEstimates, not execution guarantees. Cross-impact is not modelled, so");
console.log("concentrated books read optimistically.\n");
