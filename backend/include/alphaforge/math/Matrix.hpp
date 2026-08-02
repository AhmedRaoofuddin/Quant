#pragma once
///
/// \file Matrix.hpp
/// \brief NaN-aware dense matrix (rows = dates, cols = symbols) — the numeric substrate.
///
/// The whole quant core operates on panels shaped [date x symbol]. Rather than pull in a
/// heavyweight linear-algebra dependency, Alpha-Forge ships a focused double matrix that
/// implements exactly the operations the Alpha DSL and the backtester need:
///   * cross-sectional (per-row): rank, zscore, scale, demean, row reductions;
///   * time-series (per-column): shift, delta, rolling mean/std/sum/min/max/rank/argmax,
///     linear-decay weighting, rolling correlation & covariance.
/// Missing values are represented as NaN and skipped by every reduction, mirroring how real
/// market panels behave (listings start late, tickers halt, etc.).
///
#include <cstddef>
#include <string>
#include <vector>

namespace alphaforge::math {

/// Not-a-number sentinel for missing observations.
double nan_value() noexcept;

/// True if \p x is NaN.
bool is_nan(double x) noexcept;

/// Dense row-major matrix with string row (date) and column (symbol) labels.
class Matrix {
public:
    Matrix() = default;
    Matrix(std::vector<std::string> rows, std::vector<std::string> cols);
    Matrix(std::vector<std::string> rows, std::vector<std::string> cols,
           std::vector<double> data);

    [[nodiscard]] std::size_t rows() const noexcept { return row_labels_.size(); }
    [[nodiscard]] std::size_t cols() const noexcept { return col_labels_.size(); }
    [[nodiscard]] bool empty() const noexcept { return data_.empty(); }

    [[nodiscard]] const std::vector<std::string>& row_labels() const noexcept { return row_labels_; }
    [[nodiscard]] const std::vector<std::string>& col_labels() const noexcept { return col_labels_; }

    /// Element access (bounds-checked in debug via assert; hot paths use raw index).
    [[nodiscard]] double& at(std::size_t r, std::size_t c) noexcept { return data_[r * cols() + c]; }
    [[nodiscard]] double at(std::size_t r, std::size_t c) const noexcept { return data_[r * cols() + c]; }

    [[nodiscard]] const std::vector<double>& data() const noexcept { return data_; }

    /// Build a matrix shaped like \p like, filled with NaN.
    [[nodiscard]] static Matrix like(const Matrix& like);

    // --- element-wise arithmetic (NaN-propagating) ------------------------
    [[nodiscard]] Matrix operator+(const Matrix& o) const;
    [[nodiscard]] Matrix operator-(const Matrix& o) const;
    [[nodiscard]] Matrix operator*(const Matrix& o) const;
    [[nodiscard]] Matrix operator/(const Matrix& o) const;
    [[nodiscard]] Matrix operator+(double s) const;
    [[nodiscard]] Matrix operator-(double s) const;
    [[nodiscard]] Matrix operator*(double s) const;
    [[nodiscard]] Matrix operator/(double s) const;
    [[nodiscard]] Matrix negate() const;

    // --- element-wise unary functions -------------------------------------
    [[nodiscard]] Matrix apply_sign() const;
    [[nodiscard]] Matrix apply_abs() const;
    [[nodiscard]] Matrix apply_log() const;                 ///< log of positive values, else NaN.
    [[nodiscard]] Matrix apply_pow(double e) const;
    [[nodiscard]] Matrix apply_signed_pow(double e) const;  ///< sign(x) * |x|^e.
    [[nodiscard]] Matrix clip_lower(double lo) const;
    [[nodiscard]] Matrix clip_upper(double hi) const;
    [[nodiscard]] static Matrix element_min(const Matrix& a, const Matrix& b);
    [[nodiscard]] static Matrix element_max(const Matrix& a, const Matrix& b);

    // --- cross-sectional (per-row) ----------------------------------------
    [[nodiscard]] Matrix cs_rank() const;      ///< percentile rank in [0,1] within each row.
    [[nodiscard]] Matrix cs_zscore() const;    ///< (x - row_mean) / row_std.
    [[nodiscard]] Matrix cs_scale(double target = 1.0) const;  ///< sum|x| per row = target.
    [[nodiscard]] Matrix cs_demean() const;    ///< subtract each row's mean.

    // --- time-series (per-column) -----------------------------------------
    [[nodiscard]] Matrix ts_shift(int k) const;
    [[nodiscard]] Matrix ts_delta(int k) const;             ///< x - shift(k).
    [[nodiscard]] Matrix ts_mean(int window) const;
    [[nodiscard]] Matrix ts_std(int window) const;
    [[nodiscard]] Matrix ts_sum(int window) const;
    [[nodiscard]] Matrix ts_min(int window) const;
    [[nodiscard]] Matrix ts_max(int window) const;
    [[nodiscard]] Matrix ts_rank(int window) const;         ///< rank of last value in window.
    [[nodiscard]] Matrix ts_argmax(int window) const;
    [[nodiscard]] Matrix ts_argmin(int window) const;
    [[nodiscard]] Matrix ts_decay_linear(int window) const;
    [[nodiscard]] static Matrix ts_correlation(const Matrix& a, const Matrix& b, int window);
    [[nodiscard]] static Matrix ts_covariance(const Matrix& a, const Matrix& b, int window);

    /// Replace +/-inf with NaN (called after divisions/logs).
    [[nodiscard]] Matrix sanitized() const;

    /// Throw ComputeError if \p o has a different shape. Public so free helpers can validate.
    void ensure_same_shape(const Matrix& o) const;

private:
    std::vector<std::string> row_labels_;
    std::vector<std::string> col_labels_;
    std::vector<double> data_;  ///< row-major, size = rows*cols.
};

}  // namespace alphaforge::math
