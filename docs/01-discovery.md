# Phase 1 — Discovery (Research · Scope · Requirements · ROI · Design · Sign-off)

> Lifecycle gate: **nothing is built until Requirements and Design are signed off by IDD +
> Business.** This document is that record for Alpha-Forge.

## 1. Research

- **Problem:** systematic alpha research is slow — a human proposes a factor, hand-codes a
  backtest, and iterates. Most ideas are noise, and the ones that survive are often overfit.
- **Approach chosen:** an LLM proposes candidate alphas as *formulas* (not code), which a fast,
  auditable engine scores at scale, with explicit multiple-testing correction. This is the live
  2024–2026 research direction (LLM factor-proposal + classical evaluation/allocation).
- **Model options:** Claude (Opus/Sonnet) via the Anthropic API for proposal; no model is trusted
  to *judge* edge — significance is decided by statistics, not by an LLM.
- **Lessons from similar work:** WorldQuant-style formulaic alphas; Bailey & López de Prado on the
  deflated Sharpe ratio; `ml4trading` for leak-free backtest hygiene.

## 2. Scope

**In scope:** cross-sectional daily equity alphas; offline + LLM proposal; leak-free backtest;
significance + decorrelation selection; portfolio allocation; REST API; dashboard; local Supabase.

**Out of scope (v1):** intraday/microstructure execution, live broker connectivity, options
pricing, reinforcement-learning allocation (interface is provided for a future drop-in).

**Owners:** Business owner (research lead) · AI owner (platform engineering).
**Ministry touchpoints:** SSO/identity, UAE-region storage, IT service portal, central logging.

## 3. Requirements

**Functional (by role):**
- *Viewer* — see dashboards, runs, leaderboard, allocation.
- *Analyst* — trigger discovery, inspect rejected alphas + reasons.
- *Admin* — manage users/roles, read the audit trail, promote to production.

**Non-functional:** discovery on the default universe completes in minutes; reproducible offline
(seeded); Arabic/English-ready UI (RTL); all data encrypted and held in-region; every action
audited.

**Acceptance tests (samples):**
- A proposed alpha that is not a legal DSL formula is rejected and never executed.
- The same seed produces the same proposed/selected counts (determinism).
- A signal correlated with future returns is profitable; a shape-mismatched signal throws.
- Deflated Sharpe decreases as the number of trials increases.

## 4. ROI

| | By hand (today) | With Alpha-Forge |
|---|---|---|
| Propose + code + backtest one alpha | ~2–4 hours | seconds (proposal cached, backtest vectorised) |
| Alphas evaluated per analyst-day | ~3–5 | hundreds |
| Multiple-testing control | ad hoc | automatic (deflated Sharpe) |
| Reproducibility / audit | manual | built-in, per run |

Payback: the engineering cost is recovered once it replaces a few analyst-weeks of manual
backtesting per quarter; the durable gain is *research throughput* and *fewer false positives
reaching a portfolio*.

## 5. Design

See [`architecture.md`](architecture.md). Clean/hexagonal layering; a shared domain model at the
centre; the pipeline depends only on interfaces. UI in the Claude design language.

## 6. Sign-off

| Item | IDD | Business | Date |
|---|---|---|---|
| Requirements | ☐ | ☐ | |
| Design | ☐ | ☐ | |

Timeline is locked at sign-off. Any change afterward is a Change Request or Phase 2 item.
