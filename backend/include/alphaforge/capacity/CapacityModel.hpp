#pragma once
///
/// \file CapacityModel.hpp
/// \brief Strategy capacity: how much capital a signal can absorb before its alpha dies.
///
/// A Sharpe ratio quoted without a capacity is close to meaningless. Every allocator asks the
/// same question: a signal with gross Sharpe 1.5 that saturates at $100m is worth far less than
/// one with Sharpe 0.8 that scales to $5b, because only the second can be funded at size.
/// Funds run capacity models internally; the open-source ecosystem does not, which is why
/// backtests are published with a Sharpe and no notion of how much they can actually carry.
///
/// The model here is the standard practitioner decomposition of implementation shortfall:
///
///   cost_bps(Q) = half_spread_bps  +  eta * sigma_daily * sqrt(Q / ADV) * 1e4
///
/// The concave square-root term is the Almgren-Chriss / Barra-style temporary impact law: the
/// price moves against you roughly as the square root of the fraction of daily volume you
/// consume. Because cost grows as sqrt(AUM) while gross P&L grows linearly, net alpha is
/// unimodal in AUM: it rises, peaks, and is eventually eaten entirely by impact. That crossing
/// point is the capacity.
///
/// References: Almgren, Thum, Hauptmann & Li, "Direct Estimation of Equity Market Impact" (2005);
/// Torre & Ferrari, BARRA Market Impact Model (1997); Kyle (1985).
///
#include <string>
#include <vector>

namespace alphaforge::capacity {

/// One position the strategy needs to hold, with the liquidity available to trade it.
struct PositionLiquidity {
    std::string symbol;
    double weight = 0.0;          ///< target portfolio weight (absolute, sums to ~1 across the book)
    double adv_usd = 0.0;         ///< average daily traded value in USD
    double daily_vol = 0.0;       ///< daily return volatility (decimal, e.g. 0.02 for 2%)
    double spread_bps = 0.0;      ///< quoted bid-ask spread in basis points
};

struct CapacityAssumptions {
    double gross_ann_return = 0.0;   ///< gross annualised return of the strategy (decimal)
    double ann_vol = 0.0;            ///< annualised volatility of the strategy (decimal)
    double annual_turnover = 0.0;    ///< round-trips per year (2.0 = full book twice a year)
    double eta = 0.55;               ///< impact coefficient; empirical estimates cluster near 0.3-1.0
    double participation_cap = 0.10; ///< max fraction of ADV considered tradable in a day
    double fee_bps = 0.5;            ///< commissions and fees per side, in basis points
};

/// One point on the capacity curve.
struct CapacityPoint {
    double aum_usd = 0.0;
    double participation = 0.0;   ///< ADV-weighted average participation rate
    double cost_bps = 0.0;        ///< round-trip implementation cost in basis points
    double annual_cost = 0.0;     ///< annual drag as a decimal of AUM
    double net_ann_return = 0.0;
    double net_sharpe = 0.0;
    bool breaches_participation = false; ///< some leg exceeds the tradable share of ADV
};

struct CapacityReport {
    std::vector<CapacityPoint> curve;
    double gross_sharpe = 0.0;
    double capacity_at_half_sharpe = 0.0; ///< AUM where net Sharpe falls to half its gross value
    double capacity_at_zero_alpha = 0.0;  ///< AUM where net return reaches zero
    double peak_net_pnl_aum = 0.0;        ///< AUM maximising absolute net dollar P&L
    double peak_net_pnl_usd = 0.0;
    double liquidity_limited_aum = 0.0;   ///< AUM at which the participation cap first binds
    std::string binding_constraint;       ///< "impact" | "liquidity"
    double deployable_capacity = 0.0;     ///< whichever limit binds first: the real deployable size
    bool impact_capacity_unbounded = false; ///< impact never ate half the Sharpe inside the sweep
    bool zero_alpha_unbounded = false;    ///< alpha never reached zero inside the sweep
    bool peak_pnl_unbounded = false;      ///< dollar P&L still climbing at the top of the sweep
    double sweep_max_aum = 0.0;           ///< upper sweep bound, so a pinned figure reads as "> X"
};

class CapacityModel {
public:
    CapacityModel(std::vector<PositionLiquidity> book, CapacityAssumptions assumptions);

    /// Round-trip cost in basis points for deploying `aum_usd` across the book.
    [[nodiscard]] double costBps(double aum_usd, double* participation_out = nullptr,
                                 bool* breach_out = nullptr) const;

    /// Sweep AUM logarithmically between the bounds and solve for the capacity thresholds.
    [[nodiscard]] CapacityReport analyse(double min_aum = 1e6, double max_aum = 5e10,
                                         int steps = 60) const;

private:
    std::vector<PositionLiquidity> book_;
    CapacityAssumptions a_;
};

}  // namespace alphaforge::capacity
