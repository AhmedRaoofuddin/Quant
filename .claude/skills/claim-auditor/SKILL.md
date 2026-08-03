---
name: claim-auditor
description: Audit an advertised trading track record and decide whether the numbers hold up. Use when someone shares a screenshot, advert, social post or pitch deck quoting a Sharpe ratio, win rate, total return, trade count or "verified" P&L and asks whether it is real, legitimate, achievable or a scam. Checks internal consistency, statistical power, trade frequency and capacity, and returns a contradictory / unsupported / underpowered / plausible verdict with the arithmetic shown.
---

# Claim auditor

Marketed trading systems all publish the same flattering half of the evidence: a Sharpe ratio, a
win rate, a total return, a screenshot of an equity curve. Never a capacity. Never a trial count.
Never a standard error.

This skill takes those advertised numbers at face value and asks the two questions the advertiser
did not.

## The first question is arithmetic, not statistics

A win rate and a reward/risk ratio imply an expectancy per trade. Multiply by the trade count and
you get total risk-units earned, which pins down the risk per trade required to reach the
advertised return:

```
expectancy   = winRate x rewardRisk - (1 - winRate)          [in units of risk]
totalR       = expectancy x trades
riskPerTrade = ln(1 + totalReturn) / totalR
```

When `riskPerTrade` comes back at a hundredth of a percent, the claim is **internally
contradictory** and no statistical test is needed to reject it. This is the single most useful check
because it cannot be argued with: either the win rate is invented, the trade count is invented, or
the dollar figures are decoration.

## The second question is power

```
t = Sharpe x sqrt(years)
```

A Sharpe of 4.9 over 64 days is `4.9 x sqrt(0.175)` = **t of 2.06**. That barely clears
significance treating it as the only strategy ever tried, and collapses at ten variants. Short
windows make high Sharpes weak evidence, not strong evidence, and this is the most common way a
real-looking number misleads.

## How to run it

```bash
node .claude/skills/claim-auditor/scripts/audit.mjs \
  --sharpe 4.91 --days 64 --trades 62819 --win-rate 0.58 \
  --reward-risk 3.92 --total-return 21.40 --book-depth 50000
```

Or as JSON, which is easier when transcribing from a screenshot:

```bash
node .claude/skills/claim-auditor/scripts/audit.mjs --json claim.json
```

`node .claude/skills/claim-auditor/scripts/audit.mjs --demo` runs a real advertised claim.

## Fields

| Flag | Meaning |
|---|---|
| `--sharpe` | annualised Sharpe as advertised |
| `--days` | length of the live record in calendar days |
| `--total-return` | decimal, so 2,140% is `21.40` |
| `--trades` | number of trades over the record |
| `--win-rate` | decimal, so 58% is `0.58` |
| `--reward-risk` | average reward/risk on a winner, in units risked |
| `--variants-tried` | how many versions they admit testing (default 1) |
| `--book-depth` | USD depth of the market being traded, if known |
| `--participation-cap` | tradable share of depth (default 0.10) |

Partial input is fine. Each check runs only when its inputs are present, and a missing capacity is
itself reported as a finding.

## Verdicts

- **contradictory** — the figures disagree with each other. Rejectable on arithmetic.
- **unsupported** — consistent, but the evidence fails on record length or trial count.
- **underpowered** — nothing wrong, sample too short to distinguish from luck.
- **plausible** — survives these checks *as stated*.

`plausible` is not `verified`. Trial counts are self-reported, and capacity is usually the real
constraint.

## Read the capacity finding carefully

A strategy can be entirely genuine and still worthless at size. Prediction-market contracts and
small-cap books often carry tens of thousands of dollars of depth, which at a 10% participation cap
means five figures of deployable capital. A latency edge on a thin book is a real edge and a small
business at the same time. When you report a verdict, report the capacity next to it.

## What this skill will not do

It will not tell you a system is profitable. Passing these checks only means the advertised numbers
are not self-refuting and the sample is not obviously too short. Fabricated inputs produce a clean
audit, because the audit only ever sees what was advertised.

## Pairs with

`backtest-firewall` when you have the actual return series rather than a summary, which is a far
stronger test. `strategy-capacity` to size a book properly once you have liquidity data.
