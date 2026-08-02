# Alpha-Forge skills

Three Claude Code skills extracted from this codebase. They work standalone: plain Node, no
dependencies, no server, no API keys. Copy any of them into your own `.claude/skills/` and Claude
picks them up automatically.

```bash
cp -r alpha-forge/.claude/skills/strategy-capacity  ~/.claude/skills/
cp -r alpha-forge/.claude/skills/backtest-firewall  ~/.claude/skills/
cp -r alpha-forge/.claude/skills/strategy-builder   ~/.claude/skills/
```

| Skill | Answers |
|---|---|
| [strategy-builder](strategy-builder/SKILL.md) | What does this trading idea actually do? |
| [backtest-firewall](backtest-firewall/SKILL.md) | Is that result real, or the best of many tried? |
| [strategy-capacity](strategy-capacity/SKILL.md) | How much money can it run before impact eats it? |

## They chain

The three answer the questions an allocator asks, in order. Run them that way:

```bash
# 1. build and compare a family of strategies from a price panel
node .claude/skills/strategy-builder/scripts/backtest.mjs \
     --prices prices.csv --emit-returns returns.json

# 2. check the family is not just overfitting noise
node .claude/skills/backtest-firewall/scripts/firewall.mjs --returns returns.json

# 3. size the survivor
node .claude/skills/strategy-capacity/scripts/capacity.mjs \
     --gross-return 0.14 --vol 0.12 --turnover 6 --book book.json
```

Every script has a `--demo` flag that runs on generated data, so you can see the output shape
before wiring up your own.

## Why these three

A backtest result is only meaningful with all three answers. Sharpe alone is the number everyone
publishes and the one that survives contact with production least often:

- A Sharpe with no **capacity** cannot be sized, and short-horizon strategies routinely post the
  best Sharpe in a family while carrying the least capital.
- A Sharpe with no **PBO** is the maximum of however many variants were tried, and the maximum of
  enough noise is always impressive. The firewall on pure random data reports 97% PBO, which is
  the correct answer.
- A strategy with no **family** to compare against cannot be tested for either, which is why the
  builder produces several at once rather than one.

## Provenance

Each script mirrors a module in this repo, so behaviour matches the platform:

| Script | Mirrors |
|---|---|
| `strategy-capacity/scripts/capacity.mjs` | `backend/src/capacity/CapacityModel.cpp`, `frontend/lib/capacity.ts` |
| `backtest-firewall/scripts/firewall.mjs` | `frontend/lib/validation.ts` |
| `strategy-builder/scripts/backtest.mjs` | `frontend/lib/strategies.ts` |

The C++ engine is the reference implementation and carries the property tests
(`backend/tests/test_capacity.cpp`). The Node scripts exist so the skills work with nothing
installed.

## Shared conventions

- **No look-ahead.** Signals at `t` see data up to `t`; returns are earned `t` to `t+1`.
- **Nothing is `eval`'d.** Scoring rules are declarative trees over a whitelisted op set, validated
  before execution, so a model-authored strategy cannot run arbitrary code.
- **Estimates, not advice.** Capacity numbers are models of market impact, not execution
  guarantees, and none of this is investment advice.
