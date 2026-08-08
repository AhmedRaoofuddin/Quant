#pragma once
///
/// \file MarketData.hpp
/// \brief Market-data value types and the feature panel the quant core consumes.
///
#include <map>
#include <string>
#include <vector>

#include "alphaforge/math/Matrix.hpp"

namespace alphaforge::data {

/// One daily OHLCV observation — the atomic unit crawlers produce and stores persist.
struct PriceBar {
    std::string date;    ///< ISO-8601 (YYYY-MM-DD)
    std::string symbol;
    double open = 0.0;
    double high = 0.0;
    double low = 0.0;
    double close = 0.0;
    double volume = 0.0;
};

/// Wide feature panels (rows = dates, cols = symbols) plus the forward-return target.
///
/// The forward-return matrix is already shifted so that row t holds the return earned from
/// t -> t+horizon. This is what makes the backtest leak-free: today's signal only ever meets
/// tomorrow's return.
class FeatureSet {
public:
    FeatureSet() = default;

    std::map<std::string, math::Matrix> fields;  ///< open, high, low, close, volume, vwap, returns, dollar_volume
    math::Matrix forward_returns;
    std::vector<std::string> dates;
    std::vector<std::string> symbols;

    [[nodiscard]] bool empty() const noexcept { return dates.empty(); }
    [[nodiscard]] const math::Matrix& field(const std::string& name) const;

    /// Positional row-slice [begin, end) applied to every panel (in/out-of-sample split).
    [[nodiscard]] FeatureSet slice(std::size_t begin, std::size_t end) const;
};

}  // namespace alphaforge::data
