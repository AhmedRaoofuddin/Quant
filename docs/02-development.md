# Phase 2 — Development

Four work streams build in parallel, all bound to **one agreed data model** at the centre
(`backend/include/alphaforge/domain/Types.hpp`).

## Shared data model
Plain value types — `AlphaExpression`, `AlphaMetrics`, `EvaluatedAlpha`, `Allocation`,
`BacktestResult`, `DiscoveryRun`, `AuditEvent` — with serialisation kept separate
(`domain/Serialization`). Nothing crosses a module boundary as a loose map.

## Backend & database readiness
- **Data layer** (`data/`): ingestion (`SyntheticDataSource`, `CsvDataSource`, vendor adapter),
  the **crawler** (`MarketDataCrawler`, fault-tolerant per symbol), the **feature builder**
  (wide date×symbol panels + leak-free forward-return target), and **repositories**
  (`FilePriceRepository`/`FileRunRepository`, plus `PostgresRepository` for Supabase).
- **Storage & residency:** every artifact is stamped with `region` (UAE-North). Supabase migration
  in `supabase/migrations` creates the `alphaforge` schema with RLS.
- **Single sign-on:** Supabase Auth (OIDC) fronts the frontend; the backend writer uses the
  service role. `AF_SSO_ENABLED` gates production.

## AI agents (the engine)
- **Alpha DSL** (`dsl/`): a sandboxed formula language — lexer → parser → validator → evaluator
  over the `Matrix` core. The security boundary that lets an LLM propose executable-but-safe alphas.
- **Proposer** (`proposer/AlphaProposer`): Claude via libcurl when configured, else a curated
  offline library. **Caching** (content-addressed) cuts cost; **auto-retry + safe fallback**
  means a failed call degrades gracefully instead of aborting.
- **Second AI** (`proposer/RiskReviewer`): independent overfit/economic-soundness review.
- **Engine** (`engine/`): leak-free `Backtester` + `Metrics` (Sharpe, IC, **deflated Sharpe**).
- **Selection / Allocation** (`selection/`, `allocator/`): significance + decorrelation, then
  risk-parity / mean-variance / equal-weight behind one interface.

## Deployment & DevOps
Three environments (Development / Testing-UAT / Production) via `AF_ENVIRONMENT`. Dockerfiles and
`deploy/docker-compose*.yml`; multi-stage builds; versioned images. Frontend + backend deploy to
the UAE region. See [`06-production.md`](06-production.md).

## Frontend
Next.js 14 + Tailwind in the Claude design language. RBAC-aware, Arabic/English (RTL-ready). Reads
from Supabase or the C++ REST API. Components are dependency-light (the equity curve is hand-rolled
SVG).
