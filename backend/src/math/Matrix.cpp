#include "alphaforge/math/Matrix.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::math {

namespace {
constexpr double kNaN = std::numeric_limits<double>::quiet_NaN();

/// Minimum non-NaN observations required for a rolling window to emit a value.
int min_periods(int window) { return std::max(2, window / 2); }

/// Percentile rank of value at index \p pos among the finite entries of \p v, in [0,1].
double percentile_rank(const std::vector<double>& v, std::size_t pos) {
    const double target = v[pos];
    if (is_nan(target)) return kNaN;
    std::size_t less = 0, equal = 0, count = 0;
    for (double x : v) {
        if (is_nan(x)) continue;
        ++count;
        if (x < target) ++less;
        else if (x == target) ++equal;
    }
    if (count <= 1) return kNaN;
    // Average rank for ties, normalised to (0,1].
    const double rank = static_cast<double>(less) + (static_cast<double>(equal) + 1.0) / 2.0;
    return rank / static_cast<double>(count);
}
}  // namespace

double nan_value() noexcept { return kNaN; }
bool is_nan(double x) noexcept { return std::isnan(x); }

Matrix::Matrix(std::vector<std::string> rows, std::vector<std::string> cols)
    : row_labels_(std::move(rows)),
      col_labels_(std::move(cols)),
      data_(row_labels_.size() * col_labels_.size(), kNaN) {}

Matrix::Matrix(std::vector<std::string> rows, std::vector<std::string> cols,
               std::vector<double> data)
    : row_labels_(std::move(rows)), col_labels_(std::move(cols)), data_(std::move(data)) {
    if (data_.size() != row_labels_.size() * col_labels_.size()) {
        throw InternalError("Matrix data size does not match dimensions");
    }
}

Matrix Matrix::like(const Matrix& like) {
    return Matrix(like.row_labels_, like.col_labels_);
}

void Matrix::ensure_same_shape(const Matrix& o) const {
    if (rows() != o.rows() || cols() != o.cols()) {
        throw ComputeError("Matrix shape mismatch in element-wise operation");
    }
}

// --- element-wise arithmetic -----------------------------------------------
#define AF_ELEMENTWISE(OP)                                       \
    ensure_same_shape(o);                                        \
    Matrix r = like(*this);                                      \
    for (std::size_t i = 0; i < data_.size(); ++i)               \
        r.data_[i] = data_[i] OP o.data_[i];                     \
    return r;

Matrix Matrix::operator+(const Matrix& o) const { AF_ELEMENTWISE(+) }
Matrix Matrix::operator-(const Matrix& o) const { AF_ELEMENTWISE(-) }
Matrix Matrix::operator*(const Matrix& o) const { AF_ELEMENTWISE(*) }
Matrix Matrix::operator/(const Matrix& o) const { AF_ELEMENTWISE(/) }
#undef AF_ELEMENTWISE

#define AF_SCALAR(OP)                                            \
    Matrix r = like(*this);                                      \
    for (std::size_t i = 0; i < data_.size(); ++i)               \
        r.data_[i] = data_[i] OP s;                              \
    return r;

Matrix Matrix::operator+(double s) const { AF_SCALAR(+) }
Matrix Matrix::operator-(double s) const { AF_SCALAR(-) }
Matrix Matrix::operator*(double s) const { AF_SCALAR(*) }
Matrix Matrix::operator/(double s) const { AF_SCALAR(/) }
#undef AF_SCALAR

Matrix Matrix::negate() const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i) r.data_[i] = -data_[i];
    return r;
}

// --- element-wise unary -----------------------------------------------------
Matrix Matrix::apply_sign() const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i) {
        const double x = data_[i];
        r.data_[i] = is_nan(x) ? kNaN : (x > 0) - (x < 0);
    }
    return r;
}

Matrix Matrix::apply_abs() const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i) r.data_[i] = std::fabs(data_[i]);
    return r;
}

Matrix Matrix::apply_log() const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i) {
        const double x = data_[i];
        r.data_[i] = (!is_nan(x) && x > 0.0) ? std::log(x) : kNaN;
    }
    return r;
}

Matrix Matrix::apply_pow(double e) const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i) r.data_[i] = std::pow(data_[i], e);
    return r.sanitized();
}

Matrix Matrix::apply_signed_pow(double e) const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i) {
        const double x = data_[i];
        r.data_[i] = is_nan(x) ? kNaN : ((x > 0) - (x < 0)) * std::pow(std::fabs(x), e);
    }
    return r;
}

Matrix Matrix::clip_lower(double lo) const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i)
        r.data_[i] = is_nan(data_[i]) ? kNaN : std::max(data_[i], lo);
    return r;
}

Matrix Matrix::clip_upper(double hi) const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < data_.size(); ++i)
        r.data_[i] = is_nan(data_[i]) ? kNaN : std::min(data_[i], hi);
    return r;
}

Matrix Matrix::element_min(const Matrix& a, const Matrix& b) {
    a.ensure_same_shape(b);
    Matrix r = like(a);
    for (std::size_t i = 0; i < a.data_.size(); ++i) {
        r.data_[i] = (is_nan(a.data_[i]) || is_nan(b.data_[i]))
                         ? kNaN
                         : std::min(a.data_[i], b.data_[i]);
    }
    return r;
}

Matrix Matrix::element_max(const Matrix& a, const Matrix& b) {
    a.ensure_same_shape(b);
    Matrix r = like(a);
    for (std::size_t i = 0; i < a.data_.size(); ++i) {
        r.data_[i] = (is_nan(a.data_[i]) || is_nan(b.data_[i]))
                         ? kNaN
                         : std::max(a.data_[i], b.data_[i]);
    }
    return r;
}

// --- cross-sectional --------------------------------------------------------
Matrix Matrix::cs_rank() const {
    Matrix r = like(*this);
    std::vector<double> row(cols());
    for (std::size_t i = 0; i < rows(); ++i) {
        for (std::size_t j = 0; j < cols(); ++j) row[j] = at(i, j);
        for (std::size_t j = 0; j < cols(); ++j) r.at(i, j) = percentile_rank(row, j);
    }
    return r;
}

Matrix Matrix::cs_demean() const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < rows(); ++i) {
        double sum = 0.0;
        std::size_t n = 0;
        for (std::size_t j = 0; j < cols(); ++j) {
            const double x = at(i, j);
            if (!is_nan(x)) { sum += x; ++n; }
        }
        const double mean = n ? sum / n : kNaN;
        for (std::size_t j = 0; j < cols(); ++j) {
            const double x = at(i, j);
            r.at(i, j) = is_nan(x) ? kNaN : x - mean;
        }
    }
    return r;
}

Matrix Matrix::cs_zscore() const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < rows(); ++i) {
        double sum = 0.0, sq = 0.0;
        std::size_t n = 0;
        for (std::size_t j = 0; j < cols(); ++j) {
            const double x = at(i, j);
            if (!is_nan(x)) { sum += x; sq += x * x; ++n; }
        }
        if (n < 2) continue;
        const double mean = sum / n;
        const double var = (sq - n * mean * mean) / (n - 1);
        const double sd = var > 0 ? std::sqrt(var) : kNaN;
        for (std::size_t j = 0; j < cols(); ++j) {
            const double x = at(i, j);
            r.at(i, j) = (is_nan(x) || is_nan(sd)) ? kNaN : (x - mean) / sd;
        }
    }
    return r;
}

Matrix Matrix::cs_scale(double target) const {
    Matrix r = like(*this);
    for (std::size_t i = 0; i < rows(); ++i) {
        double denom = 0.0;
        for (std::size_t j = 0; j < cols(); ++j) {
            const double x = at(i, j);
            if (!is_nan(x)) denom += std::fabs(x);
        }
        for (std::size_t j = 0; j < cols(); ++j) {
            const double x = at(i, j);
            r.at(i, j) = (is_nan(x) || denom == 0.0) ? kNaN : x / denom * target;
        }
    }
    return r;
}

// --- time-series helpers ----------------------------------------------------
namespace {
using RollingFn = double (*)(const std::vector<double>&);

Matrix rolling(const Matrix& m, int window, const RollingFn fn) {
    if (window <= 0) throw ComputeError("rolling window must be positive");
    Matrix r = Matrix::like(m);
    const int mp = min_periods(window);
    std::vector<double> buf;
    buf.reserve(window);
    for (std::size_t j = 0; j < m.cols(); ++j) {
        for (std::size_t i = 0; i < m.rows(); ++i) {
            if (static_cast<int>(i) + 1 < window) continue;
            buf.clear();
            int valid = 0;
            for (int k = 0; k < window; ++k) {
                const double x = m.at(i - k, j);
                buf.push_back(x);
                if (!is_nan(x)) ++valid;
            }
            r.at(i, j) = (valid >= mp) ? fn(buf) : kNaN;
        }
    }
    return r;
}

double r_mean(const std::vector<double>& w) {
    double s = 0; int n = 0;
    for (double x : w) if (!is_nan(x)) { s += x; ++n; }
    return n ? s / n : kNaN;
}
double r_sum(const std::vector<double>& w) {
    double s = 0; bool any = false;
    for (double x : w) if (!is_nan(x)) { s += x; any = true; }
    return any ? s : kNaN;
}
double r_std(const std::vector<double>& w) {
    double s = 0, sq = 0; int n = 0;
    for (double x : w) if (!is_nan(x)) { s += x; sq += x * x; ++n; }
    if (n < 2) return kNaN;
    const double mean = s / n;
    const double var = (sq - n * mean * mean) / (n - 1);
    return var > 0 ? std::sqrt(var) : 0.0;
}
double r_min(const std::vector<double>& w) {
    double m = kNaN;
    for (double x : w) if (!is_nan(x)) m = is_nan(m) ? x : std::min(m, x);
    return m;
}
double r_max(const std::vector<double>& w) {
    double m = kNaN;
    for (double x : w) if (!is_nan(x)) m = is_nan(m) ? x : std::max(m, x);
    return m;
}
// The window buffer is ordered newest-first (index 0 = current row).
double r_rank_last(const std::vector<double>& w) { return percentile_rank(w, 0); }
double r_argmax(const std::vector<double>& w) {
    // Offset (in days back) of the max; 0 = today. Reported as days since max.
    int best = -1; double bv = kNaN;
    for (int i = 0; i < static_cast<int>(w.size()); ++i) {
        if (is_nan(w[i])) continue;
        if (best < 0 || w[i] > bv) { bv = w[i]; best = i; }
    }
    return best < 0 ? kNaN : static_cast<double>(best);
}
double r_argmin(const std::vector<double>& w) {
    int best = -1; double bv = kNaN;
    for (int i = 0; i < static_cast<int>(w.size()); ++i) {
        if (is_nan(w[i])) continue;
        if (best < 0 || w[i] < bv) { bv = w[i]; best = i; }
    }
    return best < 0 ? kNaN : static_cast<double>(best);
}
}  // namespace

Matrix Matrix::ts_shift(int k) const {
    Matrix r = like(*this);
    for (std::size_t j = 0; j < cols(); ++j) {
        for (std::size_t i = 0; i < rows(); ++i) {
            const long src = static_cast<long>(i) - k;
            if (src >= 0 && src < static_cast<long>(rows())) r.at(i, j) = at(src, j);
        }
    }
    return r;
}

Matrix Matrix::ts_delta(int k) const { return *this - ts_shift(k); }
Matrix Matrix::ts_mean(int window) const { return rolling(*this, window, r_mean); }
Matrix Matrix::ts_std(int window) const { return rolling(*this, window, r_std); }
Matrix Matrix::ts_sum(int window) const { return rolling(*this, window, r_sum); }
Matrix Matrix::ts_min(int window) const { return rolling(*this, window, r_min); }
Matrix Matrix::ts_max(int window) const { return rolling(*this, window, r_max); }
Matrix Matrix::ts_rank(int window) const { return rolling(*this, window, r_rank_last); }
Matrix Matrix::ts_argmax(int window) const { return rolling(*this, window, r_argmax); }
Matrix Matrix::ts_argmin(int window) const { return rolling(*this, window, r_argmin); }

Matrix Matrix::ts_decay_linear(int window) const {
    if (window <= 0) throw ComputeError("decay window must be positive");
    Matrix r = like(*this);
    std::vector<double> weights(window);
    double wsum = 0;
    for (int k = 0; k < window; ++k) { weights[k] = window - k; wsum += weights[k]; }
    for (double& w : weights) w /= wsum;  // newest gets highest weight
    for (std::size_t j = 0; j < cols(); ++j) {
        for (std::size_t i = 0; i < rows(); ++i) {
            if (static_cast<int>(i) + 1 < window) continue;
            double acc = 0; bool ok = true;
            for (int k = 0; k < window; ++k) {
                const double x = at(i - k, j);
                if (is_nan(x)) { ok = false; break; }
                acc += x * weights[k];
            }
            if (ok) r.at(i, j) = acc;
        }
    }
    return r;
}

namespace {
Matrix rolling_pair(const Matrix& a, const Matrix& b, int window, bool covariance) {
    a.ensure_same_shape(b);
    if (window <= 0) throw ComputeError("rolling window must be positive");
    Matrix r = Matrix::like(a);
    const int mp = min_periods(window);
    for (std::size_t j = 0; j < a.cols(); ++j) {
        for (std::size_t i = 0; i < a.rows(); ++i) {
            if (static_cast<int>(i) + 1 < window) continue;
            double sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
            int n = 0;
            for (int k = 0; k < window; ++k) {
                const double x = a.at(i - k, j), y = b.at(i - k, j);
                if (is_nan(x) || is_nan(y)) continue;
                sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; ++n;
            }
            if (n < mp) continue;
            const double cov = (sxy - sx * sy / n) / (n - 1);
            if (covariance) { r.at(i, j) = cov; continue; }
            const double vx = (sxx - sx * sx / n) / (n - 1);
            const double vy = (syy - sy * sy / n) / (n - 1);
            const double denom = std::sqrt(vx * vy);
            r.at(i, j) = denom > 0 ? cov / denom : nan_value();
        }
    }
    return r;
}
}  // namespace

Matrix Matrix::ts_correlation(const Matrix& a, const Matrix& b, int window) {
    return rolling_pair(a, b, window, /*covariance=*/false);
}
Matrix Matrix::ts_covariance(const Matrix& a, const Matrix& b, int window) {
    return rolling_pair(a, b, window, /*covariance=*/true);
}

Matrix Matrix::sanitized() const {
    Matrix r = *this;
    for (double& x : r.data_) {
        if (std::isinf(x)) x = kNaN;
    }
    return r;
}

}  // namespace alphaforge::math
