#include "alphaforge/capacity/CapacityModel.hpp"

#include "alphaforge/platform/Error.hpp"
#include "framework.hpp"

using namespace alphaforge::capacity;

namespace {
std::vector<PositionLiquidity> book(double adv = 5e8) {
    // Three equally weighted large caps, 2% daily vol, 2bp spreads.
    return {
        {"AAA", 1.0, adv, 0.02, 2.0},
        {"BBB", 1.0, adv, 0.02, 2.0},
        {"CCC", 1.0, adv, 0.02, 2.0},
    };
}

CapacityAssumptions assumptions() {
    CapacityAssumptions a;
    a.gross_ann_return = 0.20;  // 20% gross
    a.ann_vol = 0.10;           // gross Sharpe 2.0
    a.annual_turnover = 12.0;   // monthly rebalance
    return a;
}
}  // namespace

AF_TEST(capacity_cost_grows_with_size_but_concavely) {
    const CapacityModel m(book(), assumptions());
    const double c1 = m.costBps(1e6);
    const double c2 = m.costBps(1e8);   // 100x the capital
    CHECK(c2 > c1);
    // Square-root impact: 100x notional should raise the impact term ~10x, never 100x.
    CHECK(c2 < 100.0 * c1);
}

AF_TEST(capacity_net_sharpe_decays_with_aum) {
    const CapacityModel m(book(), assumptions());
    const CapacityReport r = m.analyse(1e6, 1e11, 40);
    CHECK(r.curve.size() == 40);
    CHECK_NEAR(r.gross_sharpe, 2.0, 1e-9);
    // Monotonic decay: cost only ever rises with size.
    for (std::size_t i = 1; i < r.curve.size(); ++i) {
        CHECK(r.curve[i].net_sharpe <= r.curve[i - 1].net_sharpe + 1e-12);
    }
    // At the smallest size almost all of the gross Sharpe survives.
    CHECK(r.curve.front().net_sharpe > 1.8);
    // At extreme size the strategy is under water.
    CHECK(r.curve.back().net_sharpe < 0.0);
}

AF_TEST(capacity_thresholds_are_ordered_and_bracketed) {
    const CapacityModel m(book(), assumptions());
    const CapacityReport r = m.analyse(1e6, 1e11, 50);
    // Half-Sharpe must be reached before alpha is fully consumed.
    CHECK(r.capacity_at_half_sharpe < r.capacity_at_zero_alpha);
    CHECK(r.capacity_at_half_sharpe > 1e6);
    CHECK(r.capacity_at_zero_alpha < 1e11);
}

AF_TEST(capacity_peak_pnl_sits_between_the_thresholds) {
    const CapacityModel m(book(), assumptions());
    const CapacityReport r = m.analyse(1e6, 1e11, 60);
    // Dollar P&L peaks after per-unit alpha has started decaying but before it turns negative.
    CHECK(r.peak_net_pnl_usd > 0.0);
    CHECK(r.peak_net_pnl_aum <= r.capacity_at_zero_alpha);
}

AF_TEST(capacity_scales_with_liquidity) {
    // A book that trades 10x the volume should absorb far more capital.
    const CapacityReport thin = CapacityModel(book(5e7), assumptions()).analyse(1e6, 1e11, 40);
    const CapacityReport deep = CapacityModel(book(5e8), assumptions()).analyse(1e6, 1e11, 40);
    CHECK(deep.capacity_at_half_sharpe > thin.capacity_at_half_sharpe);
    // Square-root law: 10x the ADV buys about 10x the capacity for the same impact.
    const double ratio = deep.capacity_at_half_sharpe / thin.capacity_at_half_sharpe;
    CHECK(ratio > 5.0);
    CHECK(ratio < 20.0);
}

AF_TEST(capacity_flags_the_participation_limit) {
    // A very thin book should hit the ADV cap and report liquidity as the binding constraint.
    const CapacityReport r = CapacityModel(book(1e6), assumptions()).analyse(1e6, 1e11, 40);
    CHECK(r.liquidity_limited_aum > 0.0);
    CHECK(r.binding_constraint == "liquidity");
}

AF_TEST(capacity_deployable_is_the_tighter_of_the_two_limits) {
    const CapacityReport r = CapacityModel(book(), assumptions()).analyse(1e6, 1e11, 60);
    // Whichever constraint binds, the deployable figure must never exceed either limit it claims
    // to respect, and must match the constraint it names.
    CHECK(r.deployable_capacity > 0.0);
    if (r.binding_constraint == "liquidity") {
        CHECK_NEAR(r.deployable_capacity, r.liquidity_limited_aum, 1e-6);
        CHECK(r.deployable_capacity <= r.capacity_at_half_sharpe + 1e-6);
    } else {
        CHECK_NEAR(r.deployable_capacity, r.capacity_at_half_sharpe, 1e-6);
    }
}

AF_TEST(capacity_deployable_falls_back_to_liquidity_when_impact_never_bites) {
    // A cheap, deep book whose impact stays trivial inside the sweep: the half-Sharpe figure pins
    // to the upper bound and is a floor rather than an answer, so the ADV cap must take over.
    CapacityAssumptions a = assumptions();
    a.annual_turnover = 0.25;  // trades almost never, so impact barely accumulates
    const double max_aum = 1e10;
    const CapacityReport r = CapacityModel(book(1e8), a).analyse(1e6, max_aum, 60);

    CHECK(r.impact_capacity_unbounded);
    CHECK(r.binding_constraint == "liquidity");
    CHECK(r.deployable_capacity < max_aum);
    CHECK_NEAR(r.deployable_capacity, r.liquidity_limited_aum, 1e-6);
}

AF_TEST(capacity_rejects_degenerate_input) {
    CHECK_THROWS(CapacityModel({}, assumptions()), alphaforge::ComputeError);
    CapacityAssumptions bad = assumptions();
    bad.ann_vol = 0.0;
    CHECK_THROWS(CapacityModel(book(), bad), alphaforge::ComputeError);
}
