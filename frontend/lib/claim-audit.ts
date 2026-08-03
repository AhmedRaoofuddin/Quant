/**
 * Track-record auditor: turn an advertised performance claim into a verdict.
 *
 * Every marketed trading system publishes the same shape of evidence, and it is always the
 * flattering half: a Sharpe ratio, a win rate, a total return, a screenshot. Never a capacity,
 * never a trial count, never a standard error. This module takes those advertised numbers at face
 * value and asks two questions the advertiser did not:
 *
 *   1. Are they even consistent with each other?
 *   2. If they are, is the sample long enough to mean anything?
 *
 * Point one matters more than it sounds. A win rate and a reward/risk ratio imply an expectancy per
 * trade; multiply by the trade count and you get total risk-units earned, which pins down the risk
 * per trade needed to reach the advertised return. When that number comes back absurd, the claim is
 * internally contradictory and no amount of statistics is required to reject it.
 *
 * This is deliberately arithmetic rather than clever. Every check is one line of algebra a reader
 * can redo by hand, which is the point: the conclusion should not depend on trusting us either.
 */

import { normCdf, normPpf, TRADING_DAYS } from "./stats";

export interface PerformanceClaim {
  label?: string;
  /** Annualised Sharpe ratio as advertised. */
  sharpe?: number;
  /** Length of the live track record in calendar days. */
  days?: number;
  /** Total return over the record, as a decimal (2140% -> 21.4). */
  totalReturn?: number;
  /** Number of trades taken over the record. */
  trades?: number;
  /** Win rate as a decimal (58% -> 0.58). */
  winRate?: number;
  /** Average reward-to-risk on a winning trade, in units of the amount risked. */
  rewardRisk?: number;
  /** How many variants the author admits to testing. Almost never disclosed. */
  variantsTried?: number;
  /** Depth of the book being traded, in USD, if known. */
  bookDepthUsd?: number;
  /** Fraction of book depth treated as tradable. */
  participationCap?: number;
}

export type Severity = "fatal" | "warning" | "note";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** The arithmetic, so a reader can check it without trusting the tool. */
  working?: string;
}

export interface ClaimAudit {
  label: string;
  findings: Finding[];
  /** t-statistic implied by the Sharpe and the record length. */
  tStat: number | null;
  /** One-sided p-value of that t-statistic. */
  pValue: number | null;
  /** Family-wise p after a Bonferroni step for the disclosed (or assumed) trial count. */
  familyWiseP: number | null;
  /** Calendar days the claimed Sharpe would need to clear 95% confidence. */
  daysRequired: number | null;
  /** Risk per trade, as a fraction of equity, implied by win rate, R/R, trades and return. */
  impliedRiskPerTrade: number | null;
  /** Deployable capital implied by book depth and the participation cap. */
  impliedCapacityUsd: number | null;
  verdict: "unsupported" | "contradictory" | "underpowered" | "plausible";
  summary: string;
}

/** Trial counts to show alongside the disclosed figure, because the disclosed one is usually 1. */
const TRIAL_LADDER = [1, 10, 50, 200, 1000];

const pct = (v: number, dp = 2) => `${(v * 100).toFixed(dp)}%`;
const usd = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
  : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`;

export function auditClaim(c: PerformanceClaim): ClaimAudit {
  const findings: Finding[] = [];
  const label = c.label?.trim() || "Unnamed claim";

  // --- 1. Statistical strength of the Sharpe over the stated window -------------
  let tStat: number | null = null;
  let pValue: number | null = null;
  let familyWiseP: number | null = null;
  let daysRequired: number | null = null;

  if (c.sharpe !== undefined && c.days !== undefined && c.days > 0) {
    const years = c.days / 365;
    tStat = c.sharpe * Math.sqrt(years);
    pValue = 1 - normCdf(tStat);

    const trials = Math.max(1, c.variantsTried ?? 1);
    familyWiseP = Math.min(1, trials * pValue);

    // Minimum track record length for the claimed Sharpe to clear 95% one-sided.
    const srPeriod = c.sharpe / Math.sqrt(TRADING_DAYS);
    if (Math.abs(srPeriod) > 1e-9) {
      const z = normPpf(0.95);
      const periods = 1 + (z / srPeriod) ** 2 * 0.5;   // normal returns, no skew adjustment
      daysRequired = (periods / TRADING_DAYS) * 365;
    }

    const ladder = TRIAL_LADDER
      .map((n) => `${n} tried -> p=${Math.min(1, n * pValue!).toFixed(3)}`)
      .join(", ");

    if (tStat < 2) {
      findings.push({
        id: "weak-t",
        severity: "fatal",
        title: `A Sharpe of ${c.sharpe} over ${c.days} days is only t = ${tStat.toFixed(2)}`,
        detail:
          "That does not clear significance even treating the strategy as the only one ever " +
          "tested. A high Sharpe over a short window is weak evidence, not strong evidence.",
        working: `t = SR x sqrt(years) = ${c.sharpe} x sqrt(${years.toFixed(3)}) = ${tStat.toFixed(2)}; one-sided p = ${pValue.toFixed(4)}`,
      });
    } else if (familyWiseP > 0.05) {
      findings.push({
        id: "dies-on-trials",
        severity: "fatal",
        title: `Significant only if this was the single variant ever tried`,
        detail:
          `t = ${tStat.toFixed(2)} gives p = ${pValue.toFixed(4)} in isolation, but ` +
          `${trials} disclosed variants push the family-wise p to ${familyWiseP.toFixed(3)}. ` +
          "Nobody arrives at a live system on the first attempt.",
        working: ladder,
      });
    } else {
      findings.push({
        id: "t-survives",
        severity: "note",
        title: `t = ${tStat.toFixed(2)} survives the disclosed trial count`,
        detail:
          "This clears the bar as stated. It says nothing about capacity, and the trial count is " +
          "self-reported, which is the weakest evidence in the whole audit.",
        working: ladder,
      });
    }

    if (daysRequired !== null && c.days < daysRequired) {
      findings.push({
        id: "short-record",
        severity: "warning",
        title: `Track record is shorter than the claim needs`,
        detail:
          `A Sharpe of ${c.sharpe} needs roughly ${daysRequired.toFixed(0)} calendar days to ` +
          `reach 95% confidence. The record is ${c.days} days.`,
        working: `periods = 1 + (z / SR_period)^2 / 2, SR_period = ${c.sharpe} / sqrt(252)`,
      });
    }
  }

  // --- 2. Internal consistency: the check that needs no statistics --------------
  let impliedRiskPerTrade: number | null = null;

  if (
    c.winRate !== undefined && c.rewardRisk !== undefined &&
    c.trades !== undefined && c.trades > 0 &&
    c.totalReturn !== undefined && c.totalReturn > -1
  ) {
    const expectancy = c.winRate * c.rewardRisk - (1 - c.winRate);
    const totalR = expectancy * c.trades;

    if (expectancy <= 0) {
      findings.push({
        id: "negative-edge",
        severity: "fatal",
        title: "The stated win rate and reward/risk imply a losing system",
        detail: "A positive total return cannot come from a negative expectancy.",
        working: `expectancy = ${c.winRate} x ${c.rewardRisk} - ${(1 - c.winRate).toFixed(2)} = ${expectancy.toFixed(3)} R`,
      });
    } else {
      impliedRiskPerTrade = Math.log(1 + c.totalReturn) / totalR;

      // A real discretionary or systematic book risks somewhere between 0.1% and 2% per trade.
      // Anything far below that means the advertised edge statistics cannot be producing the
      // advertised return, whatever else is true.
      if (impliedRiskPerTrade < 0.0001) {
        findings.push({
          id: "inconsistent",
          severity: "fatal",
          title: "The advertised numbers contradict each other",
          detail:
            `A ${pct(c.winRate, 0)} win rate at ${c.rewardRisk} R/R over ${c.trades.toLocaleString()} ` +
            `trades earns ${totalR.toFixed(0)} units of risk. To land on ${pct(c.totalReturn, 0)} total ` +
            `return, each trade can only have risked ${pct(impliedRiskPerTrade, 5)} of equity. ` +
            "At any normal position size the same inputs compound to an impossible figure, so the " +
            "win rate, the trade count and the return cannot all be genuine.",
          working:
            `expectancy = ${expectancy.toFixed(3)} R; total = ${expectancy.toFixed(3)} x ${c.trades} = ${totalR.toFixed(0)} R; ` +
            `risk = ln(${(1 + c.totalReturn).toFixed(1)}) / ${totalR.toFixed(0)} = ${pct(impliedRiskPerTrade, 5)}`,
        });
      } else if (impliedRiskPerTrade > 0.05) {
        findings.push({
          id: "reckless-size",
          severity: "warning",
          title: `Implied risk per trade is ${pct(impliedRiskPerTrade, 1)}`,
          detail:
            "Position sizing this large means the record is dominated by a handful of outcomes " +
            "and a single adverse run ends it. Sharpe is close to meaningless at this size.",
        });
      } else {
        findings.push({
          id: "size-plausible",
          severity: "note",
          title: `Implied risk per trade is ${pct(impliedRiskPerTrade, 2)}, which is plausible`,
          detail: "The win rate, reward/risk, trade count and total return are mutually consistent.",
        });
      }
    }
  }

  // --- 3. Trade frequency versus the stated mechanism ---------------------------
  if (c.trades !== undefined && c.days !== undefined && c.days > 0) {
    const perDay = c.trades / c.days;
    if (perDay > 200) {
      findings.push({
        id: "frequency",
        severity: "warning",
        title: `${perDay.toFixed(0)} trades a day`,
        detail:
          "At this frequency the result is an execution and cost problem, not a forecasting one. " +
          "Any figure quoted gross of fees, spread and slippage is meaningless here, and the " +
          "capacity is set by book depth rather than by the signal.",
        working: `${c.trades.toLocaleString()} / ${c.days} = ${perDay.toFixed(0)} per day`,
      });
    }
  }

  // --- 4. Capacity, which marketed claims never state --------------------------
  let impliedCapacityUsd: number | null = null;
  if (c.bookDepthUsd !== undefined && c.bookDepthUsd > 0) {
    const cap = c.participationCap ?? 0.10;
    impliedCapacityUsd = c.bookDepthUsd * cap;
    findings.push({
      id: "capacity",
      severity: "warning",
      title: `Deployable capital is about ${usd(impliedCapacityUsd)}`,
      detail:
        `At ${usd(c.bookDepthUsd)} of book depth and a ${pct(cap, 0)} participation cap, this is ` +
        "the size the strategy supports regardless of its Sharpe. A real edge on a thin book is " +
        "still a small business.",
      working: `${usd(c.bookDepthUsd)} x ${pct(cap, 0)} = ${usd(impliedCapacityUsd)}`,
    });
  } else {
    findings.push({
      id: "no-capacity",
      severity: "warning",
      title: "No capacity is stated",
      detail:
        "Returns are quoted without the size they were earned at, so there is no way to tell " +
        "whether the result scales past a personal account.",
    });
  }

  // --- verdict ------------------------------------------------------------------
  const fatal = findings.filter((f) => f.severity === "fatal");
  const contradiction = fatal.some((f) => f.id === "inconsistent" || f.id === "negative-edge");

  const verdict: ClaimAudit["verdict"] =
    contradiction ? "contradictory"
    : fatal.length ? "unsupported"
    : findings.some((f) => f.id === "short-record") ? "underpowered"
    : "plausible";

  const summary =
    verdict === "contradictory"
      ? "The advertised figures are not consistent with one another. This can be rejected on arithmetic alone, without any statistical test."
      : verdict === "unsupported"
      ? "The numbers are internally consistent but the evidence does not support the claim once record length and trial count are accounted for."
      : verdict === "underpowered"
      ? "Nothing here is contradictory, but the record is too short to distinguish this from luck."
      : "The claim survives these checks as stated. That is not the same as verified: trial counts are self-reported and capacity is usually the binding constraint.";

  return {
    label, findings, tStat, pValue, familyWiseP, daysRequired,
    impliedRiskPerTrade, impliedCapacityUsd, verdict, summary,
  };
}
