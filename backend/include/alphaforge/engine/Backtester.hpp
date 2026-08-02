#pragma once
///
/// \file Backtester.hpp
/// \brief Leak-free vectorised cross-sectional long/short backtest.
///
/// Convention (deliberately simple and auditable):
///   1. Each date the alpha signal is dollar-neutralised (subtract the cross-sectional mean)
///      and scaled to unit gross exposure (sum |w| = 1).
///   2. The weight decided on date t earns the return t -> t+1. Because forward_returns is
///      pre-shifted by the feature builder, there is no look-ahead.
///   3. Turnover = sum |w_t - w_{t-1}| is charged at cost_bps per side.
///
#include <map>
#include <string>
#include <vector>

#include "alphaforge/domain/Types.hpp"
#include "alphaforge/math/Matrix.hpp"

namespace alphaforge::engine {

/// Full output of a backtest: the metrics scorecard plus the series needed to plot it.
struct BacktestOutput {
    domain::AlphaMetrics metrics;
    std::vector<double> net_returns;   ///< per-date net return (finite entries only)
    std::vector<std::string> dates;    ///< dates aligned to net_returns
    std::vector<double> equity_curve;  ///< cumulative growth of 1 unit
};

class Backtester {
public:
    explicit Backtester(double cost_bps = 5.0) : cost_bps_(cost_bps) {}

    /// Convert a raw signal into dollar-neutral, unit-gross weights.
    [[nodiscard]] static math::Matrix signal_to_weights(const math::Matrix& signal);

    /// Backtest a single alpha signal. \p n_trials feeds the deflated Sharpe.
    [[nodiscard]] BacktestOutput run(const math::Matrix& signal,
                                     const math::Matrix& forward_returns,
                                     const std::string& alpha_id = "",
                                     int n_trials = 1) const;

    /// Backtest a weighted blend of alpha signals (portfolio-level).
    [[nodiscard]] BacktestOutput run_portfolio(
        const std::map<std::string, math::Matrix>& signals,
        const std::map<std::string, double>& weights,
        const math::Matrix& forward_returns) const;

private:
    double cost_bps_;
};

}  // namespace alphaforge::engine
