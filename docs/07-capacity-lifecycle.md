# Strategy Capacity Analyzer — the six-phase lifecycle

The capacity feature was taken through the same AI Development Lifecycle as the rest of the
platform. This document is the per-phase record for that feature.

---

## Phase 1 — Discovery (Research · Scope · Requirements · ROI · Design · Sign-off)

### Research

The question was: what does a serious quant desk need that the open-source ecosystem does not
already provide? A survey of GitHub as of August 2026 found the adjacent spaces are saturated:

| Space | State of the art | Verdict |
|---|---|---|
| Matching engines | Several C++20 engines at 8-15 ns/op with reproducible benchmarks (`Keyuan-Wang/low-latency-matching-engine`, `wanghan0826/quant-matching-engine`, `Johannestampere/order_book_simulator`) | Saturated |
| Execution-aware backtesting | `nkaz001/hftbacktest` models queue position, latency and full L2/L3 tick data | Well covered |
| Overfitting statistics | `esvhd/pypbo` (Python) and CRAN `pbo` (R) implement PBO/CSCV and Deflated Sharpe | Covered as libraries |
| **Strategy capacity** | Funds run capacity models internally. Academic work on alpha decay exists (Di Mascio, Lines & Naik). **No open-source tool produces a capacity curve.** | **Gap** |

The gap is real and it is the commercially decisive one. Industry practice: *"a signal with a
theoretical gross Sharpe of 1.5 and a capacity of $100 million is far less commercially valuable
to a firm managing $60 billion than a signal with a theoretical gross Sharpe of 0.8 and a capacity
of $5 billion."* A Sharpe ratio published without a capacity is close to meaningless, yet every
open-source backtester stops at the Sharpe.

### Scope

**In scope:** a capacity curve (net Sharpe versus deployed capital), capacity thresholds, the
binding-constraint diagnosis, and per-name liquidity, computed from live market data.

**Out of scope (v1):** cross-impact between correlated names, intraday scheduling and optimal
execution trajectories, borrow costs and short availability, and non-equity asset classes.

**Owners:** research lead (business), platform engineering (AI/technical).

### Requirements

*Functional*
- Given a book of positions and strategy assumptions, produce a capacity curve.
- Report capacity at half gross Sharpe, capacity at zero net alpha, and peak dollar P&L.
- Identify whether impact or the participation cap binds first.
- Let the analyst vary gross return, volatility, turnover, impact coefficient and book size.

*Non-functional*
- Deterministic and reproducible from the same inputs.
- Thresholds solved numerically, not read off a discrete grid.
- Degrades safely on thin or missing liquidity data.

*Acceptance tests* (implemented in `backend/tests/test_capacity.cpp`)
- Cost rises with size but sub-linearly, never linearly.
- Net Sharpe decays monotonically in AUM.
- Half-Sharpe capacity strictly precedes zero-alpha capacity.
- Ten times the ADV buys roughly ten times the capacity (square-root law sanity check).
- A thin book reports `liquidity` as the binding constraint.
- Degenerate input (empty book, zero volatility) throws rather than returning nonsense.

### ROI

| | Without the tool | With it |
|---|---|---|
| Answering "how much can this run?" | Manual spreadsheet per strategy, hours, rarely repeated | Seconds, and re-run on every parameter change |
| Basis for the estimate | Analyst intuition | Calibrated square-root impact on live ADV |
| Capital misallocation risk | A signal funded past its capacity quietly loses money | Saturation point identified before funding |

### Design

`CapacityModel` takes a book of `PositionLiquidity` plus `CapacityAssumptions` and sweeps AUM
geometrically. Round-trip cost decomposes as

```
cost_bps(Q) = half_spread + eta * sigma_daily * sqrt(Q / ADV) * 1e4 + fees      (per side, x2)
```

the Almgren-Chriss / BARRA temporary-impact form. Gross P&L scales linearly in AUM while cost
scales as its square root, so net alpha is unimodal: it rises, peaks, then goes negative.
Thresholds are found by geometric bisection because AUM spans four orders of magnitude.

### Sign-off

| Item | IDD | Business | Date |
|---|---|---|---|
| Requirements | ☐ | ☐ | |
| Design | ☐ | ☐ | |

---

## Phase 2 — Development

| Stream | Delivered |
|---|---|
| Shared data model | `PositionLiquidity`, `CapacityAssumptions`, `CapacityPoint`, `CapacityReport` in `capacity/CapacityModel.hpp` |
| Backend engine | `capacity/CapacityModel.cpp` — impact model, AUM sweep, bisection solver. Compiles clean under `-Wall -Wextra -Wpedantic` |
| Data readiness | `advUsd` (median daily traded value, last quarter) and `spreadBps` (high-low range proxy) added to the market-data layer |
| API | `GET /api/capacity` with overridable assumptions as query parameters |
| Frontend | `/capacity` — metric strip, capacity curve with threshold markers, per-name liquidity table, live assumption sliders |

The median is used for both ADV and the spread proxy so a single earnings day or gap cannot
distort the liquidity estimate.

---

## Phase 3 — Governance and Guardrails

- **Input validation:** an empty book, zero volatility, or invalid sweep bounds throw
  `ComputeError` rather than silently producing a curve.
- **No unbounded extrapolation:** the participation cap (default 10% of ADV) marks the point past
  which the book is not tradable at any cost, and the UI reports it as the binding constraint.
- **Estimates labelled as estimates.** The UI states the impact form, the ADV definition and the
  spread proxy, and says plainly that these are estimates and not execution guarantees.
- **No investment advice.** The output is a capacity range, never a recommendation.
- **Data residency and provenance** are unchanged: public keyless sources, region-tagged.

---

## Phase 4 — Testing and Bug Fixing

Seven unit and property tests in `backend/tests/test_capacity.cpp`, covering concavity,
monotonic decay, threshold ordering, peak-P&L placement, the liquidity-scaling law, the
participation-cap flag, and degenerate input.

**Bug found and fixed during verification.** The first spread proxy used 6% of the average daily
range, which produced 43bp for MU and 20bp for NVDA. Real US large-cap quoted spreads are
1-2bp, so the model was overstating cost by an order of magnitude and understating capacity.
Recalibrated to 0.5% of the *median* range with a 20bp clamp, which now yields NVDA 1.59bp,
GOOGL 1.20bp and JPM 0.91bp. This is exactly the kind of error a practitioner would catch on
sight, and it materially changed the answer.

---

## Phase 5 — User Acceptance Testing

| # | Step | Pass condition |
|---|---|---|
| 1 | Agree pass conditions | Analysts agree the impact form and default η are reasonable |
| 2 | Scenario tests | Capacity for a liquid mega-cap book exceeds that for a small-cap book |
| 3 | Shadow run | Capacity estimates compared against desk intuition for two weeks |
| 4 | Feedback | η and participation cap tuned to house convention |
| 5 | Final checks | Spreads and ADV cross-checked against a second source |
| 6 | Approval | Business owner signs off in writing |

**Known limitation to disclose at UAT:** η is a single global coefficient. Real desks calibrate it
per name and per regime from their own execution data. Cross-impact between correlated names is
not modelled, so the tool is optimistic for concentrated books.

---

## Phase 6 — Production

Against the eight-gate Definition of Done:

| Gate | Status |
|---|---|
| Owned | Research lead and platform engineering |
| Identified | Listed as the `/capacity` surface with the `/api/capacity` contract |
| Logged | Requests logged through the structured logger |
| Evaluated | Seven tests in CI; recalibration documented in Phase 4 |
| Documented | This file, plus inline derivations and citations in the engine |
| Supported | Same duty rotation as the rest of the platform |
| Observed | Latency and error rate on the capacity endpoint |
| Reversible | Pure computation with no persisted state; safe to roll back |

**Improvement loop:** as execution data accumulates, replace the global η with per-name
calibration, and add cross-impact so concentrated books stop reading optimistically.
