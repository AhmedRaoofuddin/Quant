#pragma once
///
/// \file Metrics.hpp
/// \brief Performance & statistical-significance metrics.
///
/// Includes the deflated Sharpe ratio (Bailey & López de Prado, 2014) to penalise the
/// multiple-testing bias of mining many alphas — without it the best backtest is almost always
/// a false positive.
///
#include <utility>
#include <vector>

#include "alphaforge/math/Matrix.hpp"

namespace alphaforge::engine::metrics {

inline constexpr int kTradingDays = 252;

/// Annualised Sharpe ratio of a (per-period) return series. NaNs are skipped.
[[nodiscard]] double sharpe(const std::vector<double>& returns, int periods = kTradingDays);
[[nodiscard]] double annualised_return(const std::vector<double>& returns, int periods = kTradingDays);
[[nodiscard]] double annualised_vol(const std::vector<double>& returns, int periods = kTradingDays);
[[nodiscard]] double max_drawdown(const std::vector<double>& returns);
[[nodiscard]] double skewness(const std::vector<double>& returns);
[[nodiscard]] double kurtosis(const std::vector<double>& returns);  ///< non-excess (normal = 3).

/// Probability the true Sharpe > 0 after correcting for \p n_trials attempts. Range [0,1].
[[nodiscard]] double deflated_sharpe(double observed_sharpe, long n_returns, int n_trials,
                                     double skew, double kurt, int periods = kTradingDays);

/// Daily cross-sectional Spearman IC between a signal and the forward return.
/// Returns {mean IC, IC information ratio = mean/std}.
[[nodiscard]] std::pair<double, double> information_coefficient(const math::Matrix& signal,
                                                                const math::Matrix& forward_returns);

}  // namespace alphaforge::engine::metrics
