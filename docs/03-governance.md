# Phase 3 — Governance & Guardrails

Every request passes safety checks on the way **in** to the AI and more checks on the way **out**.

## Request flow
```
User → SSO sign-in → input check → AI call → output check → second-AI review → response
                          │            │           │              │
                     rate limit   audit log   format check   high-risk only
```

## On the way in (`guardrails/InputGuard`)
- **Alpha validation:** every expression must be a legal DSL formula over the known field set
  (`dsl::validate`). Anything else is rejected **before evaluation** — the platform never
  `eval`s model output. This defeats prompt-injection-as-code by construction.
- **Prompt hygiene:** known jailbreak/injection phrasings are blocked.
- **PII redaction:** emails and long digit runs are stripped from any free text sent to the LLM.
- **Rate limiting** (`RateLimiter`): sliding one-minute window per actor/task.

## On the way out (`guardrails/OutputGuard` + `proposer/RiskReviewer`)
- **Format / "made-up" check:** model output is re-validated against the grammar; an expression that
  does not parse is discarded.
- **Second AI:** `RiskReviewer` independently interrogates surviving alphas for overfitting
  (in/out-of-sample Sharpe decay, deflated Sharpe, turnover, drawdown). Advisory, always logged.

## Authentication & data safety
- Single Ministry login (Supabase Auth / OIDC) **plus** the option for 2FA.
- **RBAC**, least privilege: `viewer | analyst | admin` enforced by Postgres **Row-Level Security**
  (`supabase/migrations/0001_init.sql`). Only admins can read the audit trail.
- Personal data redacted before any AI call; all data encrypted and held **in the UAE region**.
- Secrets (JWT, API keys) come from the environment / Ministry vault, never from code;
  `Config::enforce_production_safety()` refuses to start production with dev defaults.

## Audit record (`guardrails/AuditLog`)
Append-only JSON lines (and `alphaforge.audit_events` in Supabase): **who** asked **what**,
**when**, the outcome, tagged by **sensitivity**. Auditing can never throw out and break the
request path.
