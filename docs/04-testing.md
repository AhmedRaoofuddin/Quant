# Phase 4 — Testing & Bug Fixing

Six test types run on every change; a clear bug flow keeps fix time predictable.

## Test types
1. **Building-block (unit)** — `tests/test_matrix.cpp`, `test_metrics.cpp`, `test_json.cpp`,
   `test_dsl.cpp`. Each small piece works on its own.
2. **Connection (integration)** — `tests/test_pipeline.cpp` runs the whole pipeline end-to-end on
   synthetic data with real repositories.
3. **AI quality checks** — the DSL suite asserts that invalid/injection expressions are rejected
   and that the whole curated alpha library parses; the backtester suite asserts the leak-free
   invariant (perfect predictor is profitable; shape mismatch throws).
4. **Full-journey** — the frontend exercises dashboard → run → detail against the REST API (manual
   + Playwright-ready).
5. **Speed & load** — the vectorised engine is benchmarked on the default universe; the REST
   server is single-purpose and sits behind a proxy.
6. **Security** — CI runs a static analysis pass; the guardrail tests
   (`tests/test_guardrails.cpp`) verify injection blocking, PII redaction, and rate limiting.

> **Execution note:** the local Ministry machine blocks running freshly-built binaries, so tests
> execute in **CI (Linux)** and **Docker**. Locally, a clean compile under
> `-Wall -Wextra -Wpedantic` is the gate. See `.claude/rules/testing.md`.

## Bug-fix flow
1. **Logged** — steps to reproduce, importance noted.
2. **Assigned** — owner assigned at the daily stand-up.
3. **Fixed** — code change **plus a regression test** that would have caught it.
4. **Retested** — CI + reviewer sign-off.
5. **Closed** — for critical bugs, a review within two days.
