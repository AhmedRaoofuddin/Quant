---
description: Run the alpha-discovery pipeline and summarise the result.
---

Run a discovery pass and report the outcome for the user.

- CLI: `alphaforge discover --n 8 --allocator risk_parity`
- Summarise: number proposed vs selected, out-of-sample portfolio Sharpe and max drawdown, and
  the top 3 selected alphas (expression + in-sample vs out-of-sample Sharpe + deflated Sharpe).
- If the user asks to see it visually, point them at the dashboard (`frontend`, `npm run dev`).

Because binaries cannot be executed on this machine, run this inside Docker or CI, or describe
the exact command for the user to run locally.
