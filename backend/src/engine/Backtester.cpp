#include "alphaforge/engine/Backtester.hpp"

#include <cmath>

#include "alphaforge/engine/Metrics.hpp"
#include "alphaforge/platform/Error.hpp"

namespace alphaforge::engine {

using math::Matrix;

Matrix Backtester::signal_to_weights(const Matrix& signal) {
    // Dollar-neutral (demean) then unit-gross (sum |w| = 1). NaNs become 0 exposure.
    Matrix w = signal.cs_demean().cs_scale(1.0);
    for (std::size_t i = 0; i < w.rows(); ++i) {
        for (std::size_t j = 0; j < w.cols(); ++j) {
            if (math::is_nan(w.at(i, j))) w.at(i, j) = 0.0;
        }
    }
    return w;
}

namespace {
/// Compute per-date net returns, turnover, and the aligned date labels from a weight panel.
struct Series {
    std::vector<double> net_returns;
    std::vector<std::string> dates;
    double mean_turnover = 0.0;
};

Series pnl_from_weights(const Matrix& weights, const Matrix& fwd, double cost_bps) {
    if (weights.rows() != fwd.rows() || weights.cols() != fwd.cols()) {
        throw ComputeError("Backtester: weights/forward-returns shape mismatch");
    }
    Series out;
    double turnover_sum = 0.0;
    long turnover_n = 0;

    for (std::size_t i = 0; i < weights.rows(); ++i) {
        double gross = 0.0;
        bool any = false;
        double turnover = 0.0;
        for (std::size_t j = 0; j < weights.cols(); ++j) {
            const double w = weights.at(i, j);
            const double r = fwd.at(i, j);
            if (!math::is_nan(w) && !math::is_nan(r)) {
                gross += w * r;
                any = true;
            }
            const double prev = (i == 0) ? 0.0 : weights.at(i - 1, j);
            turnover += std::fabs(w - (math::is_nan(prev) ? 0.0 : prev));
        }
        if (!any) continue;  // no tradable names this date
        const double cost = turnover * (cost_bps / 1e4);
        out.net_returns.push_back(gross - cost);
        out.dates.push_back(weights.row_labels()[i]);
        turnover_sum += turnover;
        ++turnover_n;
    }
    out.mean_turnover = turnover_n ? turnover_sum / static_cast<double>(turnover_n) : 0.0;
    return out;
}

std::vector<double> to_equity(const std::vector<double>& returns) {
    std::vector<double> equity;
    equity.reserve(returns.size());
    double cum = 1.0;
    for (double r : returns) {
        cum *= (1.0 + r);
        equity.push_back(cum);
    }
    return equity;
}

domain::AlphaMetrics score(const std::string& id, const Series& s, const Matrix& signal,
                           const Matrix& fwd, int n_trials) {
    domain::AlphaMetrics m;
    m.alpha_id = id;
    m.sharpe = metrics::sharpe(s.net_returns);
    m.ann_return = metrics::annualised_return(s.net_returns);
    m.ann_vol = metrics::annualised_vol(s.net_returns);
    m.max_drawdown = metrics::max_drawdown(s.net_returns);
    m.turnover = s.mean_turnover;
    m.n_obs = static_cast<long>(s.net_returns.size());
    const auto [ic_mean, ic_ir] = metrics::information_coefficient(signal, fwd);
    m.ic_mean = ic_mean;
    m.ic_ir = ic_ir;
    m.deflated_sharpe = metrics::deflated_sharpe(m.sharpe, m.n_obs, n_trials,
                                                 metrics::skewness(s.net_returns),
                                                 metrics::kurtosis(s.net_returns));
    return m;
}
}  // namespace

BacktestOutput Backtester::run(const Matrix& signal, const Matrix& forward_returns,
                               const std::string& alpha_id, int n_trials) const {
    const Matrix weights = signal_to_weights(signal);
    const Series s = pnl_from_weights(weights, forward_returns, cost_bps_);
    BacktestOutput out;
    out.metrics = score(alpha_id, s, signal, forward_returns, n_trials);
    out.net_returns = s.net_returns;
    out.dates = s.dates;
    out.equity_curve = to_equity(s.net_returns);
    return out;
}

BacktestOutput Backtester::run_portfolio(const std::map<std::string, Matrix>& signals,
                                         const std::map<std::string, double>& weights,
                                         const Matrix& forward_returns) const {
    if (signals.empty()) throw ComputeError("run_portfolio: no signals");

    // Blend at the position level: sum_k allocation_k * unit_weights(signal_k).
    Matrix combined;
    bool initialised = false;
    for (const auto& [id, sig] : signals) {
        const auto it = weights.find(id);
        const double alloc = it == weights.end() ? 0.0 : it->second;
        if (alloc == 0.0) continue;
        Matrix contrib = signal_to_weights(sig) * alloc;
        if (!initialised) {
            combined = contrib;
            initialised = true;
        } else {
            combined = combined + contrib;
        }
    }
    if (!initialised) throw ComputeError("run_portfolio: all allocations are zero");

    const Series s = pnl_from_weights(combined, forward_returns, cost_bps_);
    BacktestOutput out;
    out.metrics = score("portfolio", s, combined, forward_returns, 1);
    out.net_returns = s.net_returns;
    out.dates = s.dates;
    out.equity_curve = to_equity(s.net_returns);
    return out;
}

}  // namespace alphaforge::engine
