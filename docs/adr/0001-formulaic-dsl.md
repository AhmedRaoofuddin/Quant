# ADR 0001 — Alphas are a validated DSL, not model-generated code

- **Status:** Accepted
- **Date:** 2026-08-01

## Context
An LLM proposes trading signals. The naive implementation asks the model for Python/NumPy and
executes it. That is both a security catastrophe (arbitrary code execution from model output,
prompt-injectable) and unauditable (a risk officer cannot sign off on opaque code).

## Decision
Alphas are expressed in a small **formulaic DSL** (WorldQuant-style: `rank`, `ts_mean`,
`correlation`, `delta`, …). Every expression is parsed with a hand-written recursive-descent
parser and **validated against a whitelist** of fields and functions *before* evaluation. Anything
outside the grammar is rejected and never run. Evaluation happens on an in-house NaN-aware matrix
engine — no `eval`, no `system`, no dynamic code.

## Consequences
- **Safe:** model output cannot escape the sandbox; injection-as-code is impossible by
  construction (see `guardrails/InputGuard`).
- **Auditable:** an alpha is a short algebraic formula a human can read and approve.
- **Portable & fast:** the evaluator is pure C++ with no dependency.
- **Cost:** the DSL is less expressive than arbitrary code. Accepted — the operator set covers the
  cross-sectional factor space, and new operators are cheap to add
  (`.claude/commands/new-alpha-op.md`).
