#!/usr/bin/env node
/**
 * Audit an advertised trading track record.
 *
 * Mirrors frontend/lib/claim-audit.ts. No dependencies, no server.
 *
 *   node audit.mjs --sharpe 4.91 --days 64 --trades 62819 --win-rate 0.58 \
 *                  --reward-risk 3.92 --total-return 21.40 --book-depth 50000
 *   node audit.mjs --json claim.json
 *   node audit.mjs --demo
 */

import { readFileSync } from "node:fs";

const TRADING_DAYS = 252;
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const num = (n) => { const v = parseFloat(arg(n) ?? ""); return Number.isFinite(v) ? v : undefined; };

function normCdf(z) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
const Z95 = 1.6448536269514722;

const pct = (v, dp = 2) => `${(v * 100).toFixed(dp)}%`;
const usd = (v) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
  : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`;

const DEMO = {
  label: "Instagram advert: prediction-market news-lag bot",
  sharpe: 4.91, days: 64, trades: 62819, winRate: 0.58,
  rewardRisk: 3.92, totalReturn: 21.40, variantsTried: 1, bookDepthUsd: 50_000,
};

let c;
if (argv.includes("--demo")) c = DEMO;
else if (arg("json")) {
  try { c = JSON.parse(readFileSync(arg("json"), "utf8")); }
  catch (e) { console.error(`Could not read --json: ${e.message}`); process.exit(1); }
} else {
  c = {
    label: arg("label"),
    sharpe: num("sharpe"), days: num("days"), totalReturn: num("total-return"),
    trades: num("trades"), winRate: num("win-rate"), rewardRisk: num("reward-risk"),
    variantsTried: num("variants-tried"), bookDepthUsd: num("book-depth"),
    participationCap: num("participation-cap"),
  };
}
if (!Object.values(c).some((v) => typeof v === "number")) {
  console.error("Nothing to audit. Pass at least --sharpe and --days, or --demo.");
  process.exit(1);
}

const findings = [];
const TRIALS = [1, 10, 50, 200, 1000];

// --- statistical power ------------------------------------------------------
let tStat = null, pValue = null, familyWiseP = null, daysRequired = null;
if (c.sharpe !== undefined && c.days > 0) {
  const years = c.days / 365;
  tStat = c.sharpe * Math.sqrt(years);
  pValue = 1 - normCdf(tStat);
  const trials = Math.max(1, c.variantsTried ?? 1);
  familyWiseP = Math.min(1, trials * pValue);

  const srP = c.sharpe / Math.sqrt(TRADING_DAYS);
  if (Math.abs(srP) > 1e-9) daysRequired = ((1 + (Z95 / srP) ** 2 * 0.5) / TRADING_DAYS) * 365;

  const ladder = TRIALS.map((n) => `${n}->p=${Math.min(1, n * pValue).toFixed(3)}`).join("  ");
  if (tStat < 2) {
    findings.push(["FATAL", `Sharpe ${c.sharpe} over ${c.days} days is only t = ${tStat.toFixed(2)}`,
      "Does not clear significance even as the only strategy ever tested.",
      `t = ${c.sharpe} x sqrt(${years.toFixed(3)}) = ${tStat.toFixed(2)}, p = ${pValue.toFixed(4)}`]);
  } else if (familyWiseP > 0.05) {
    findings.push(["FATAL", "Significant only if this was the single variant ever tried",
      `${trials} disclosed variants push family-wise p to ${familyWiseP.toFixed(3)}.`, ladder]);
  } else {
    findings.push(["NOTE", `t = ${tStat.toFixed(2)} survives the disclosed trial count`,
      "Says nothing about capacity, and the trial count is self-reported.", ladder]);
  }
  if (daysRequired !== null && c.days < daysRequired) {
    findings.push(["WARN", "Track record shorter than the claim needs",
      `Sharpe ${c.sharpe} needs about ${daysRequired.toFixed(0)} days for 95% confidence; record is ${c.days}.`]);
  }
}

// --- internal consistency ---------------------------------------------------
let impliedRisk = null;
if (c.winRate !== undefined && c.rewardRisk !== undefined && c.trades > 0 && c.totalReturn > -1) {
  const expectancy = c.winRate * c.rewardRisk - (1 - c.winRate);
  const totalR = expectancy * c.trades;
  if (expectancy <= 0) {
    findings.push(["FATAL", "Stated win rate and reward/risk imply a losing system",
      "A positive total return cannot come from negative expectancy.",
      `expectancy = ${c.winRate} x ${c.rewardRisk} - ${(1 - c.winRate).toFixed(2)} = ${expectancy.toFixed(3)} R`]);
  } else {
    impliedRisk = Math.log(1 + c.totalReturn) / totalR;
    if (impliedRisk < 0.0001) {
      findings.push(["FATAL", "The advertised numbers contradict each other",
        `${pct(c.winRate, 0)} win rate at ${c.rewardRisk} R/R over ${c.trades.toLocaleString()} trades ` +
        `earns ${totalR.toFixed(0)} R. Reaching ${pct(c.totalReturn, 0)} means risking only ` +
        `${pct(impliedRisk, 5)} per trade. At any normal size the same inputs compound to an ` +
        "impossible figure, so win rate, trade count and return cannot all be genuine.",
        `risk = ln(${(1 + c.totalReturn).toFixed(1)}) / ${totalR.toFixed(0)} = ${pct(impliedRisk, 5)}`]);
    } else if (impliedRisk > 0.05) {
      findings.push(["WARN", `Implied risk per trade is ${pct(impliedRisk, 1)}`,
        "The record is dominated by a few outcomes; Sharpe means little at this size."]);
    } else {
      findings.push(["NOTE", `Implied risk per trade is ${pct(impliedRisk, 2)}, which is plausible`,
        "Win rate, reward/risk, trade count and total return are mutually consistent."]);
    }
  }
}

// --- frequency --------------------------------------------------------------
if (c.trades > 0 && c.days > 0) {
  const perDay = c.trades / c.days;
  if (perDay > 200) {
    findings.push(["WARN", `${perDay.toFixed(0)} trades a day`,
      "This is an execution and cost problem, not a forecasting one. Gross figures are meaningless " +
      "and capacity is set by book depth, not by the signal.",
      `${c.trades.toLocaleString()} / ${c.days} = ${perDay.toFixed(0)} per day`]);
  }
}

// --- capacity ---------------------------------------------------------------
let capacity = null;
if (c.bookDepthUsd > 0) {
  const cap = c.participationCap ?? 0.10;
  capacity = c.bookDepthUsd * cap;
  findings.push(["WARN", `Deployable capital is about ${usd(capacity)}`,
    `At ${usd(c.bookDepthUsd)} depth and a ${pct(cap, 0)} participation cap, this is the size the ` +
    "strategy supports regardless of its Sharpe.",
    `${usd(c.bookDepthUsd)} x ${pct(cap, 0)} = ${usd(capacity)}`]);
} else {
  findings.push(["WARN", "No capacity is stated",
    "Returns quoted without the size they were earned at cannot be shown to scale."]);
}

// --- verdict ----------------------------------------------------------------
const fatal = findings.filter((f) => f[0] === "FATAL");
const contradiction = fatal.some((f) => f[1].includes("contradict") || f[1].includes("losing system"));
const verdict = contradiction ? "CONTRADICTORY"
  : fatal.length ? "UNSUPPORTED"
  : findings.some((f) => f[1].includes("shorter than")) ? "UNDERPOWERED"
  : "PLAUSIBLE";

const W = 78;
console.log(`\nTrack-record audit: ${c.label ?? "unnamed claim"}`);
console.log("=".repeat(W));
console.log(`VERDICT   ${verdict}`);
if (tStat !== null) console.log(`t-stat    ${tStat.toFixed(2)}   one-sided p ${pValue.toFixed(4)}   family-wise p ${familyWiseP.toFixed(3)}`);
if (impliedRisk !== null) console.log(`risk/trade ${pct(impliedRisk, 5)} implied by the stated win rate and return`);
if (capacity !== null) console.log(`capacity  about ${usd(capacity)} deployable`);
console.log("-".repeat(W));

for (const [sev, title, detail, working] of findings) {
  console.log(`\n[${sev}] ${title}`);
  console.log(`  ${detail}`);
  if (working) console.log(`  working: ${working}`);
}

console.log("\n" + "-".repeat(W));
console.log(
  verdict === "CONTRADICTORY"
    ? "The figures disagree with one another. Rejectable on arithmetic alone."
    : verdict === "UNSUPPORTED"
    ? "Internally consistent, but the evidence fails on record length or trial count."
    : verdict === "UNDERPOWERED"
    ? "Nothing contradictory, but the sample is too short to separate skill from luck."
    : "Survives these checks as stated. Not the same as verified: trial counts are self-reported.",
);
console.log("This audit only sees what was advertised. Fabricated inputs produce a clean report.\n");
