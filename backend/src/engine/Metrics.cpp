#include "alphaforge/engine/Metrics.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace alphaforge::engine::metrics {

namespace {
/// Standard normal CDF via the complementary error function.
double norm_cdf(double x) { return 0.5 * std::erfc(-x / std::sqrt(2.0)); }

/// Inverse standard-normal CDF (Acklam's rational approximation, ~1e-9 accuracy).
double norm_ppf(double p) {
    if (p <= 0.0) return -std::numeric_limits<double>::infinity();
    if (p >= 1.0) return std::numeric_limits<double>::infinity();
    static const double a[] = {-3.969683028665376e+01, 2.209460984245205e+02,
                               -2.759285104469687e+02, 1.383577518672690e+02,
                               -3.066479806614716e+01, 2.506628277459239e+00};
    static const double b[] = {-5.447609879822406e+01, 1.615858368580409e+02,
                               -1.556989798598866e+02, 6.680131188771972e+01,
                               -1.328068155288572e+01};
    static const double c[] = {-7.784894002430293e-03, -3.223964580411365e-01,
                               -2.400758277161838e+00, -2.549732539343734e+00,
                               4.374664141464968e+00, 2.938163982698783e+00};
    static const double d[] = {7.784695709041462e-03, 3.224671290700398e-01,
                               2.445134137142996e+00, 3.754408661907416e+00};
    const double plow = 0.02425, phigh = 1 - plow;
    if (p < plow) {
        const double q = std::sqrt(-2 * std::log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= phigh) {
        const double q = p - 0.5, r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
               (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    const double q = std::sqrt(-2 * std::log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

std::vector<double> finite(const std::vector<double>& v) {
    std::vector<double> out;
    out.reserve(v.size());
    for (double x : v) if (!math::is_nan(x)) out.push_back(x);
    return out;
}

double mean_of(const std::vector<double>& v) {
    if (v.empty()) return 0.0;
    double s = 0;
    for (double x : v) s += x;
    return s / static_cast<double>(v.size());
}

double stddev_of(const std::vector<double>& v) {
    if (v.size() < 2) return 0.0;
    const double m = mean_of(v);
    double sq = 0;
    for (double x : v) sq += (x - m) * (x - m);
    return std::sqrt(sq / static_cast<double>(v.size() - 1));
}
}  // namespace

double sharpe(const std::vector<double>& returns, int periods) {
    const auto r = finite(returns);
    const double sd = stddev_of(r);
    // Constant input does not yield sd exactly 0.0: the two-pass mean carries a rounding residual,
    // so the deviations are ~1e-18 rather than zero, and dividing the mean by that explodes. Treat
    // any volatility far below the smallest plausible real return dispersion as no risk. Real daily
    // vol sits near 1e-2 and never below ~1e-6; float residuals here are ~1e-16, so 1e-12 separates
    // them cleanly.
    if (r.size() < 2 || sd < 1e-12) return 0.0;
    return std::sqrt(static_cast<double>(periods)) * mean_of(r) / sd;
}

double annualised_return(const std::vector<double>& returns, int periods) {
    return mean_of(finite(returns)) * periods;
}

double annualised_vol(const std::vector<double>& returns, int periods) {
    return stddev_of(finite(returns)) * std::sqrt(static_cast<double>(periods));
}

double max_drawdown(const std::vector<double>& returns) {
    const auto r = finite(returns);
    if (r.empty()) return 0.0;
    double equity = 1.0, peak = 1.0, mdd = 0.0;
    for (double x : r) {
        equity *= (1.0 + x);
        peak = std::max(peak, equity);
        mdd = std::min(mdd, equity / peak - 1.0);
    }
    return mdd;
}

double skewness(const std::vector<double>& returns) {
    const auto r = finite(returns);
    if (r.size() < 3) return 0.0;
    const double m = mean_of(r), sd = stddev_of(r);
    if (sd == 0.0) return 0.0;
    double s = 0;
    for (double x : r) s += std::pow((x - m) / sd, 3);
    return s / static_cast<double>(r.size());
}

double kurtosis(const std::vector<double>& returns) {
    const auto r = finite(returns);
    if (r.size() < 4) return 3.0;
    const double m = mean_of(r), sd = stddev_of(r);
    if (sd == 0.0) return 3.0;
    double s = 0;
    for (double x : r) s += std::pow((x - m) / sd, 4);
    return s / static_cast<double>(r.size());
}

double deflated_sharpe(double observed_sharpe, long n_returns, int n_trials, double skew,
                       double kurt, int periods) {
    if (n_returns < 2 || n_trials < 1) return 0.0;
    const double sr = observed_sharpe / std::sqrt(static_cast<double>(periods));  // de-annualise

    // Expected maximum Sharpe from n_trials independent noise strategies.
    constexpr double emc = 0.5772156649;  // Euler-Mascheroni
    const double z1 = norm_ppf(1.0 - 1.0 / n_trials);
    const double z2 = norm_ppf(1.0 - 1.0 / (n_trials * std::exp(1.0)));
    const double expected_max_sr = (1 - emc) * z1 + emc * z2;

    const double sr_var = (1 - skew * sr + (kurt - 1) / 4.0 * sr * sr) / static_cast<double>(n_returns - 1);
    const double sr_std = std::sqrt(std::max(sr_var, 1e-12));
    return norm_cdf((sr - expected_max_sr * sr_std) / sr_std);
}

std::pair<double, double> information_coefficient(const math::Matrix& signal,
                                                  const math::Matrix& forward_returns) {
    // Spearman IC = Pearson correlation of cross-sectional ranks, computed per date.
    const math::Matrix sr = signal.cs_rank();
    const math::Matrix fr = forward_returns.cs_rank();
    std::vector<double> ics;
    ics.reserve(sr.rows());
    for (std::size_t i = 0; i < sr.rows(); ++i) {
        double sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        int n = 0;
        for (std::size_t j = 0; j < sr.cols(); ++j) {
            const double x = sr.at(i, j), y = fr.at(i, j);
            if (math::is_nan(x) || math::is_nan(y)) continue;
            sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; ++n;
        }
        if (n < 3) continue;
        const double cov = sxy - sx * sy / n;
        const double vx = sxx - sx * sx / n;
        const double vy = syy - sy * sy / n;
        const double denom = std::sqrt(vx * vy);
        if (denom > 0) ics.push_back(cov / denom);
    }
    const double mean = mean_of(ics);
    const double sd = stddev_of(ics);
    return {mean, sd > 0 ? mean / sd : 0.0};
}

}  // namespace alphaforge::engine::metrics
