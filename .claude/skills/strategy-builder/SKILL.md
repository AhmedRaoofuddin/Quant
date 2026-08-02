---
name: strategy-builder
description: Define, backtest and compare a family of cross-sectional trading strategies from a price panel, then rank them by capacity rather than Sharpe alone. Use when someone wants to build a factor strategy, test momentum/reversal/low-vol/quality ideas, compare several signals, backtest a scoring rule over a universe of stocks, or turn a trading idea into measured results.
---

# Strategy builder

Builds a **family** of strategies, not one. That matters twice over: capacity is strategy-specific,
and the overfitting firewall needs the whole family to measure selection damage. A single strategy
tested alone tells you almost nothing.

Each strategy is a cross-sectional scoring rule. Every rebalance the engine ranks the universe,
holds the top N equally weighted, and measures realised returns from actual prices.

## Workflow

1. **Get a price panel.** CSV with a `date` column and one close-price column per symbol. Daily or
   weekly, at least 250 rows and 15 symbols for the statistics to mean anything.
2. **Define strategies** in a JSON file (format below), or start from the six built-ins.
3. **Backtest**: `node scripts/backtest.mjs --prices prices.csv --strategies strategies.json`
4. **Run the firewall** on the emitted returns to check the family is not overfit.
5. **Rank by capacity**, not Sharpe. Report both.

```bash
node .claude/skills/strategy-builder/scripts/backtest.mjs \
  --prices prices.csv --liquidity liquidity.json --emit-returns returns.json

node .claude/skills/backtest-firewall/scripts/firewall.mjs --returns returns.json
```

## Defining a strategy

Scores are declarative expression trees over a whitelisted op set. **Never `eval` a scoring rule**,
including one a model wrote: parse it, reject anything not in the grammar. This is the same rule the
Alpha-Forge DSL enforces in `backend/src/dsl/`.

```json
[
  {
    "id": "momentum",
    "name": "Cross-sectional momentum",
    "thesis": "Buy strong trailing performers, skipping the last period to dodge reversal.",
    "rebalanceEvery": 8,
    "holdings": 10,
    "score": { "op": "ret", "lookback": 60, "skip": 1 }
  },
  {
    "id": "quality",
    "name": "Risk-adjusted momentum",
    "rebalanceEvery": 8,
    "holdings": 10,
    "score": {
      "op": "div",
      "a": { "op": "ret", "lookback": 60, "skip": 1 },
      "b": { "op": "vol", "lookback": 60 }
    }
  }
]
```

| Op | Args | Meaning |
|---|---|---|
| `ret` | `lookback`, `skip` | trailing return, optionally skipping recent periods |
| `vol` | `lookback` | trailing volatility of period returns |
| `maGap` | `lookback` | price relative to its own moving average |
| `drawdown` | `lookback` | distance below the trailing peak |
| `neg` | `a` | negate (turns momentum into reversal, vol into low-vol) |
| `add` `sub` `mul` `div` | `a`, `b` | arithmetic, division guarded against zero |
| `const` | `value` | scalar |

Run `--list-ops` to print the live grammar. Unknown ops are a hard error, not a silent zero.

## Leak-free convention (do not weaken this)

Scores at time `t` see prices up to and including `t`. The return earned runs `t` to `t+1`. If you
add an op, it must respect the same boundary. A backtest that quietly peeks one bar ahead produces
Sharpe ratios above 4 and is the single most common reason a strategy dies in production.

The backtester also charges turnover measured from actual holdings churn, not an assumed constant.

## Reading the comparison table

The output ranks by Sharpe but prints deployable capacity beside it, because those two orderings
usually disagree. Short-horizon reversal reliably tops the Sharpe column and bottoms the capacity
column: it turns over 30x a year, so impact costs scale with it.

The right question is not "which has the best Sharpe" but **"which has the best Sharpe at the size
I actually want to run"**. Answer that one.

## Guardrails

- Every extra strategy you test raises the multiple-testing burden. Test six deliberate ideas, not
  six hundred parameter tweaks. The firewall's `effectiveTrials` will derate near-clones anyway.
- Gross of costs unless you supply liquidity data. Say "gross" when quoting results.
- Survivorship bias lives in the price panel, not the code. If your universe is today's index
  members, the backtest is optimistic and no amount of statistics fixes that. Flag it.
- These are research results, not investment advice.

## Pairs with

`strategy-capacity` for sizing a single book, `backtest-firewall` for the family verdict. All three
are the same pipeline the Alpha-Forge `/strategies` page runs.
