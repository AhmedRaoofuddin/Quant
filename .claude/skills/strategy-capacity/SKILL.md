---
name: strategy-capacity
description: Compute how much capital a trading strategy can absorb before its own market impact eats the alpha. Use when someone asks about strategy capacity, scalability, how much AUM a signal supports, market impact costs, whether a backtest survives at size, or why a high-Sharpe strategy cannot be funded. Produces a capacity curve, deployable size, and the binding constraint.
---

# Strategy capacity

A Sharpe ratio quoted without a capacity is close to meaningless. Gross Sharpe 1.5 that saturates
at $100m is worth far less to an allocator than Sharpe 0.8 that scales to $5b, because only the
second can be funded at size. This skill answers **"how much can this actually run?"**

## The model

Round-trip implementation cost, applied twice per rebalance and scaled by turnover:

```
cost_bps(Q) = half_spread + eta * sigma_daily * sqrt(Q / ADV) * 1e4 + fees
```

The square-root term is the Almgren-Chriss / BARRA temporary-impact law: consuming a larger share
of daily volume moves price against you, but sub-linearly. Gross P&L grows linearly with capital
while cost grows as its square root, so **net alpha is unimodal**: it rises, peaks, then dies.

Two limits matter, and you report whichever binds first:

- **Impact capacity**, where cost has eaten half the gross Sharpe.
- **Liquidity capacity**, where a leg exceeds the tradable share of ADV (default 10%). Past this
  the book cannot be traded at any price, so it overrides the impact number.

## How to run it

```bash
node .claude/skills/strategy-capacity/scripts/capacity.mjs \
  --gross-return 0.20 --vol 0.10 --turnover 12 --eta 0.55 \
  --book '[{"symbol":"AAPL","weight":1,"advUsd":8e9,"dailyVol":0.018,"spreadBps":1.2}]'
```

Against a running Alpha-Forge instance, the live endpoint is simpler:

```bash
curl 'http://localhost:3000/api/capacity?grossReturn=0.2&vol=0.1&turnover=12&n=10'
```

## Inputs you need

| Field | Meaning | Where to get it |
|---|---|---|
| `advUsd` | Median daily traded value | median of close x volume over the last quarter |
| `dailyVol` | Daily return volatility | annualised vol / sqrt(252) |
| `spreadBps` | Quoted spread | 1-2bp for US mega caps; use a high-low proxy if unavailable |
| `turnover` | Round trips per year | rebalances per year x fraction of book replaced |
| `eta` | Impact coefficient | 0.3-1.0 empirically; 0.55 is a reasonable default |

## Reading the output

- `deployableCapacity` is the headline number. Quote this, not the impact figure alone.
- `bindingConstraint` says whether liquidity or impact is the limit. If it is `liquidity`, adding
  names or trading more patiently helps; if `impact`, only lower turnover or a cheaper universe does.
- `capacityAtZeroAlpha` is where the strategy stops making money entirely.
- `peakNetPnlAum` is the size that maximises dollar profit, which is usually **larger** than the
  size that maximises Sharpe. Allocators care about both.
- `impactCapacityUnbounded: true` means impact never bit inside the sweep, so the impact figure is
  a floor rather than an answer.

## Guardrails

- These are estimates, not execution guarantees. Say so when reporting.
- `eta` is a single global coefficient here. Real desks calibrate it per name and per regime from
  their own execution data.
- Cross-impact between correlated names is not modelled, so the tool reads **optimistically for
  concentrated books**. Flag this when the book is under ~8 names or heavily sector-concentrated.
- Never present a capacity figure as investment advice.

## The insight worth surfacing

Capacity and Sharpe frequently disagree. A short-term reversal strategy can post the best Sharpe in
a family and still be the least fundable, because it turns over 30x a year. When you report
capacity, always report it *next to* Sharpe and turnover so the tradeoff is visible.
