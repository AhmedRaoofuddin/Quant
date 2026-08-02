#include "alphaforge/engine/Metrics.hpp"

#include "framework.hpp"

namespace metrics = alphaforge::engine::metrics;

AF_TEST(metrics_sharpe_zero_when_no_variance) {
    std::vector<double> flat(50, 0.01);
    CHECK_NEAR(metrics::sharpe(flat), 0.0, 1e-9);
}

AF_TEST(metrics_sharpe_positive_for_positive_drift) {
    std::vector<double> r;
    for (int i = 0; i < 100; ++i) r.push_back(i % 2 == 0 ? 0.02 : 0.005);  // positive mean, some var
    CHECK(metrics::sharpe(r) > 0.0);
}

AF_TEST(metrics_max_drawdown_zero_when_monotonic) {
    std::vector<double> up(20, 0.01);  // always positive -> no drawdown
    CHECK_NEAR(metrics::max_drawdown(up), 0.0, 1e-9);
}

AF_TEST(metrics_max_drawdown_negative_when_loss) {
    std::vector<double> r = {0.1, -0.2, 0.05};
    CHECK(metrics::max_drawdown(r) < 0.0);
}

AF_TEST(metrics_deflated_sharpe_in_unit_interval) {
    const double dsr = metrics::deflated_sharpe(1.5, 500, 20, 0.0, 3.0);
    CHECK(dsr >= 0.0);
    CHECK(dsr <= 1.0);
}

AF_TEST(metrics_deflated_sharpe_penalises_many_trials) {
    const double few = metrics::deflated_sharpe(1.5, 500, 1, 0.0, 3.0);
    const double many = metrics::deflated_sharpe(1.5, 500, 200, 0.0, 3.0);
    CHECK(many <= few);  // more trials -> harder to be significant
}
