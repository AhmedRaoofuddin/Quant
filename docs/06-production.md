# Phase 6 — Production

Production is a loop: **release → watch → respond → improve.** Nothing ships unless all eight
Definition-of-Done gates pass.

## Definition of Done (8 gates)
**Owned · Identified · Logged · Evaluated · Documented · Supported · Observed · Reversible.**

| Gate | How Alpha-Forge meets it |
|---|---|
| Owned | Business + AI owners named in Discovery. |
| Identified | Listed on the IT service portal with an uptime target + support contact. |
| Logged | Structured JSON logs (`platform/Logger`) + append-only audit trail. |
| Evaluated | Deflated-Sharpe + OOS gates; weekly AI-quality review. |
| Documented | `docs/`, `CLAUDE.md`, ADRs, API + DSL reference. |
| Supported | Duty-engineer rotation; runbook for known failures. |
| Observed | Request/AI-call/cost tracking; health dashboards; alerts. |
| Reversible | Versioned images; auto-rollback on health fail; kill switch. |

## Releasing
- Automated build + deploy with required checks (CI must be green).
- Versioned, immutable images; old versions retained for rollback.
- **Kill switch:** a channel lead can pause the service within one day; auto-undo on health-check
  failure.

## Watching
- Every request traced end-to-end; every AI call and its **cost** tracked (proposer cache reports
  hits).
- Live health dashboards; alerts to the on-call duty engineer on anomalies.

## Incidents & improvement
- 24/7 duty-engineer rotation; step-by-step guides for known failures.
- Critical issues reviewed within two days.
- The **weekly AI-quality review** feeds new worked examples back into the test suite and the
  proposer's few-shot set — the loop that keeps quality rising.

## Adoption rollout
Pilot (5–10 named users, daily support) → Cohort A (sector + power users) → Cohort B (wider dept,
champion-led) → Full release (self-service, baseline measured). Operational handover docs + user
manual accompany go-live.
