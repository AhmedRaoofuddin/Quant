# Phase 5 — User Acceptance Testing

Ministry business users do the testing; engineers support. Each step has a **pass condition** and
a **written gate**. Approval is recorded.

| # | Step | Pass condition (gate) |
|---|------|-----------------------|
| 1 | **Agree pass conditions** | Stakeholders agree, per feature, what counts as a pass → *signed scorecard*. |
| 2 | **Step-by-step tests** | UAT scenarios run by MOI business users (not engineers) → *main flows all pass*. |
| 3 | **Shadow run** | Tool runs on real cases for two weeks; a human reviews every output before it is used → *zero unreviewed outputs*. |
| 4 | **Collect feedback** | Forms + recorded sessions; themes grouped and addressed where applicable → *themes assigned to owners*. |
| 5 | **Final checks** | Standards met; access works; scenarios passed; feedback addressed → *no accessibility failures*. |
| 6 | **Approval** | Business owner signs off and approves go-live **in writing** → *written approval*. |

## Sample UAT scenarios (Alpha-Forge)
- *Analyst runs a discovery* and can explain, from the UI, why each rejected alpha was rejected
  (reason is shown on hover).
- *Viewer* can read the dashboard and leaderboard but **cannot** trigger discovery or see the
  audit trail (RBAC enforced).
- *Admin* can view the audit trail and confirm every discovery action was recorded with actor,
  time, and outcome.
- The out-of-sample equity curve and metrics match the CLI/API for the same run id
  (UI is faithful to the engine).
- Arabic (RTL) rendering is correct on the dashboard.

## Shadow-run acceptance
During the two-week shadow, no alpha is promoted to any real process; the reviewer confirms the
deflated-Sharpe gate and decorrelation behaved as specified on live data.
