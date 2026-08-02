#include "alphaforge/engine/Backtester.hpp"

#include <cmath>
#include <string>
#include <vector>

#include "alphaforge/platform/Error.hpp"
#include "framework.hpp"

using alphaforge::engine::Backtester;
using alphaforge::engine::BacktestOutput;
using alphaforge::math::Matrix;

namespace {
struct Panel {
    Matrix signal;
    Matrix fwd;
};

/// Build a panel where the signal equals the forward return (a perfect, leak-free predictor).
Panel perfect_predictor(int n_days, int n_syms) {
    std::vector<std::string> dates, syms;
    for (int i = 0; i < n_days; ++i) dates.push_back("d" + std::to_string(i));
    for (int j = 0; j < n_syms; ++j) syms.push_back("s" + std::to_string(j));
    Matrix fwd(dates, syms), signal(dates, syms);
    // Deterministic pseudo-returns with cross-sectional spread each day.
    for (int i = 0; i < n_days; ++i) {
        for (int j = 0; j < n_syms; ++j) {
            const double r = 0.01 * std::sin(0.7 * i + j) + 0.002 * ((i + j) % 3 - 1);
            fwd.at(i, j) = r;
            signal.at(i, j) = r;  // signal knows next-day return cross-sectionally
        }
    }
    return {signal, fwd};
}
}  // namespace

AF_TEST(backtester_weights_are_dollar_neutral_and_unit_gross) {
    Panel p = perfect_predictor(5, 4);
    Matrix w = Backtester::signal_to_weights(p.signal);
    for (std::size_t i = 0; i < w.rows(); ++i) {
        double sum = 0, gross = 0;
        for (std::size_t j = 0; j < w.cols(); ++j) {
            sum += w.at(i, j);
            gross += std::fabs(w.at(i, j));
        }
        CHECK_NEAR(sum, 0.0, 1e-9);          // dollar-neutral
        CHECK_NEAR(gross, 1.0, 1e-9);        // unit gross
    }
}

AF_TEST(backtester_perfect_predictor_is_profitable) {
    Panel p = perfect_predictor(120, 6);
    Backtester bt(1.0);  // 1bp cost
    BacktestOutput out = bt.run(p.signal, p.fwd, "perfect", 1);
    CHECK(out.metrics.sharpe > 0.0);
    CHECK(out.metrics.ic_mean > 0.0);       // signal ranks predict return ranks
    CHECK(out.equity_curve.back() > 1.0);   // grew money
}

AF_TEST(backtester_shape_mismatch_throws) {
    Matrix a({"d1"}, {"x", "y"}, {1, 2});
    Matrix b({"d1"}, {"x"}, {1});
    Backtester bt;
    CHECK_THROWS(bt.run(a, b, "bad", 1), alphaforge::ComputeError);
}
