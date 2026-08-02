---
name: backtest-firewall
description: Decide whether a backtest is real edge or a statistical artefact. Use when someone shares backtest results, a Sharpe ratio, an equity curve, or a set of candidate strategies and wants to know if it will hold out of sample, or asks about overfitting, p-hacking, multiple testing, PBO, deflated Sharpe, or data snooping. Returns a robust / fragile / overfit verdict with the evidence behind it.
---

# Backtest firewall

Most published backtests are the best of many tried, and nobody reports the ones that failed. The
selection itself inflates Sharpe. This skill runs the López de Prado battery over a *family* of
return series and gives a verdict.

## The tests, and what each catches

| Test | Question it answers | Fails when |
|---|---|---|
| **PBO via CSCV** | Does the best in-sample strategy stay above median out of sample? | PBO > 0.5 |
| **Probabilistic Sharpe** | Is the Sharpe distinguishable from zero given sample length, skew, kurtosis? | PSR < 0.95 |
| **Deflated Sharpe** | Does it survive after adjusting for how many variants were tried? | DSR < 0.95 |
| **Holm haircut** | How much Sharpe is left after family-wise error control? | haircut > 50% |
| **Min backtest length** | Is the track record even long enough to conclude anything? | required years > available |
| **Block bootstrap CI** | Does the 95% interval on Sharpe include zero? | lower bound <= 0 |

PBO is the one to lead with. It is the only test that directly measures *selection* damage, and it
needs the whole family, not just the winner. Running it on a single strategy is meaningless.

## How to run it

```bash
node .claude/skills/backtest-firewall/scripts/firewall.mjs --returns returns.json
```

`returns.json` maps each strategy id to its series. Daily returns as decimals:

```json
{
  "momentum": { "dates": ["2024-01-02", "..."], "returns": [0.0031, -0.0012] },
  "reversal": { "dates": ["2024-01-02", "..."], "returns": [-0.0004, 0.0021] }
}
```

CSV also works: `--csv returns.csv` with a `date` column and one column per strategy.

Against a running Alpha-Forge instance:

```bash
curl http://localhost:3000/api/validation
```

## Interpreting the verdict

- **robust** (PBO <= 0.20). The ranking survives resampling. Still check capacity before funding.
- **fragile** (0.20 < PBO <= 0.50). The winner is partly luck of the split. Shrink expectations
  toward the family median, not the winner's number.
- **overfit** (PBO > 0.50). The best in-sample strategy lands *below* median out of sample more
  often than not. This is worse than random selection. Do not deploy.

A high family PBO does not mean every strategy is worthless. It means **you cannot trust the
selection** among them. The honest response is to widen the out-of-sample window or reduce the
number of variants tried, not to pick the winner anyway.

## Rules for using this honestly

- Count **every** variant you tried, including the ones you abandoned. The haircut is only correct
  if the trial count is. If the user cannot say how many they tried, tell them the result is a
  lower bound on the damage.
- Correlated variants are not independent trials. `effectiveTrials` derates the count from average
  pairwise correlation, so 20 near-identical momentum tweaks count as far fewer than 20.
- Never re-run the firewall after tuning against its output. That is the same overfitting one level
  up. Freeze the out-of-sample window before you look at it.
- Report the verdict even when it is unfavourable. Suppressing it defeats the entire purpose.

## Pairs with

`strategy-capacity`. A strategy must pass *both*. Robust but uncapacitated is unfundable; large
capacity on an overfit signal is a fast way to lose a lot of money.
