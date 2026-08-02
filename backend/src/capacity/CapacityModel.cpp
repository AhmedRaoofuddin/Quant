#include "alphaforge/capacity/CapacityModel.hpp"

#include <algorithm>
#include <cmath>
#include <functional>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::capacity {

namespace {
/// Bisect for the AUM at which `f` crosses zero. `f` must be decreasing over [lo, hi].
double solveCrossing(double lo, double hi, const std::function<double(double)>& f) {
    if (f(lo) <= 0) return lo;      // already below the threshold at the smallest size
    if (f(hi) > 0) return hi;       // never crosses inside the range
    for (int i = 0; i < 80; ++i) {
        const double mid = std::sqrt(lo * hi);  // geometric bisection: AUM spans orders of magnitude
        if (f(mid) > 0) lo = mid; else hi = mid;
    }
    return std::sqrt(lo * hi);
}
}  // namespace

CapacityModel::CapacityModel(std::vector<PositionLiquidity> book, CapacityAssumptions assumptions)
    : book_(std::move(book)), a_(assumptions) {
    if (book_.empty()) throw ComputeError("CapacityModel: empty book");
    if (a_.ann_vol <= 0) throw ComputeError("CapacityModel: annualised volatility must be positive");

    // Normalise weights so the book sums to 1 in absolute terms.
    double gross = 0.0;
    for (const auto& p : book_) gross += std::fabs(p.weight);
    if (gross <= 0) throw ComputeError("CapacityModel: weights sum to zero");
    for (auto& p : book_) p.weight = std::fabs(p.weight) / gross;
}

double CapacityModel::costBps(double aum_usd, double* participation_out, bool* breach_out) const {
    double weighted_cost = 0.0;   // notional-weighted cost across the book
    double weighted_part = 0.0;
    bool breach = false;

    for (const auto& p : book_) {
        if (p.weight <= 0) continue;
        const double notional = aum_usd * p.weight;
        // A round trip touches the market twice, so each side trades `notional`.
        const double adv = std::max(p.adv_usd, 1.0);
        const double participation = notional / adv;
        if (participation > a_.participation_cap) breach = true;

        // Half-spread crossing plus concave temporary impact.
        const double impact_bps = a_.eta * p.daily_vol * std::sqrt(participation) * 1e4;
        const double side_cost = 0.5 * p.spread_bps + impact_bps + a_.fee_bps;

        weighted_cost += p.weight * side_cost;
        weighted_part += p.weight * participation;
    }

    if (participation_out) *participation_out = weighted_part;
    if (breach_out) *breach_out = breach;
    return 2.0 * weighted_cost;  // entry + exit
}

CapacityReport CapacityModel::analyse(double min_aum, double max_aum, int steps) const {
    if (min_aum <= 0 || max_aum <= min_aum || steps < 2) {
        throw ComputeError("CapacityModel::analyse: invalid sweep bounds");
    }

    CapacityReport r;
    r.gross_sharpe = a_.gross_ann_return / a_.ann_vol;

    const auto netReturnAt = [&](double aum) {
        const double cost_bps = costBps(aum);
        // Each round trip costs `cost_bps`; turnover says how many happen per year.
        const double annual_cost = (cost_bps / 1e4) * a_.annual_turnover;
        return a_.gross_ann_return - annual_cost;
    };

    r.curve.reserve(static_cast<std::size_t>(steps));
    const double ratio = std::pow(max_aum / min_aum, 1.0 / (steps - 1));
    double aum = min_aum;
    double best_pnl = -1e300;

    for (int i = 0; i < steps; ++i, aum *= ratio) {
        CapacityPoint pt;
        pt.aum_usd = aum;
        pt.cost_bps = costBps(aum, &pt.participation, &pt.breaches_participation);
        pt.annual_cost = (pt.cost_bps / 1e4) * a_.annual_turnover;
        pt.net_ann_return = a_.gross_ann_return - pt.annual_cost;
        pt.net_sharpe = pt.net_ann_return / a_.ann_vol;

        const double pnl = pt.net_ann_return * aum;
        if (pnl > best_pnl) { best_pnl = pnl; r.peak_net_pnl_aum = aum; r.peak_net_pnl_usd = pnl; }

        if (pt.breaches_participation && r.liquidity_limited_aum == 0.0) r.liquidity_limited_aum = aum;
        r.curve.push_back(pt);
    }

    // Thresholds, solved rather than read off the discrete grid.
    const double half = 0.5 * r.gross_sharpe * a_.ann_vol;
    r.capacity_at_half_sharpe = solveCrossing(min_aum, max_aum,
        [&](double x) { return netReturnAt(x) - half; });
    r.capacity_at_zero_alpha = solveCrossing(min_aum, max_aum,
        [&](double x) { return netReturnAt(x); });

    // If impact never consumed half the Sharpe inside the sweep, the figure is a floor rather
    // than a capacity, and the participation cap is what really limits deployment.
    r.impact_capacity_unbounded = r.capacity_at_half_sharpe >= max_aum * 0.999;
    r.zero_alpha_unbounded = r.capacity_at_zero_alpha >= max_aum * 0.999;
    r.peak_pnl_unbounded = r.peak_net_pnl_aum >= max_aum * 0.999;
    r.sweep_max_aum = max_aum;
    const bool liquidity_binds = r.liquidity_limited_aum > 0.0 &&
        (r.impact_capacity_unbounded || r.liquidity_limited_aum < r.capacity_at_half_sharpe);
    r.binding_constraint = liquidity_binds ? "liquidity" : "impact";
    r.deployable_capacity = liquidity_binds ? r.liquidity_limited_aum : r.capacity_at_half_sharpe;
    return r;
}

}  // namespace alphaforge::capacity
