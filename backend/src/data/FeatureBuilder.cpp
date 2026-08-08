#include "alphaforge/data/FeatureBuilder.hpp"

#include <algorithm>
#include <map>
#include <set>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::data {

FeatureSet FeatureBuilder::build(const std::vector<PriceBar>& bars) const {
    if (bars.empty()) throw DataError("FeatureBuilder: no bars provided");
    if (horizon_ < 1) throw DataError("FeatureBuilder: forward horizon must be >= 1");

    // Collect the sorted union of dates and symbols.
    std::set<std::string> date_set, symbol_set;
    for (const auto& b : bars) {
        date_set.insert(b.date);
        symbol_set.insert(b.symbol);
    }
    std::vector<std::string> dates(date_set.begin(), date_set.end());
    std::vector<std::string> symbols(symbol_set.begin(), symbol_set.end());

    std::map<std::string, std::size_t> date_ix, sym_ix;
    for (std::size_t i = 0; i < dates.size(); ++i) date_ix[dates[i]] = i;
    for (std::size_t j = 0; j < symbols.size(); ++j) sym_ix[symbols[j]] = j;

    math::Matrix open(dates, symbols), high(dates, symbols), low(dates, symbols);
    math::Matrix close(dates, symbols), volume(dates, symbols);

    for (const auto& b : bars) {
        const std::size_t r = date_ix[b.date];
        const std::size_t c = sym_ix[b.symbol];
        open.at(r, c) = b.open;
        high.at(r, c) = b.high;
        low.at(r, c) = b.low;
        close.at(r, c) = b.close;
        volume.at(r, c) = b.volume;
    }

    // Derived fields.
    math::Matrix vwap = (high + low + close) / 3.0;
    math::Matrix dollar_volume = close * volume;

    // returns[t] = close[t]/close[t-1] - 1, per column.
    math::Matrix returns = math::Matrix::like(close);
    for (std::size_t j = 0; j < close.cols(); ++j) {
        for (std::size_t i = 1; i < close.rows(); ++i) {
            const double c0 = close.at(i - 1, j), c1 = close.at(i, j);
            if (!math::is_nan(c0) && !math::is_nan(c1) && c0 != 0.0) {
                returns.at(i, j) = c1 / c0 - 1.0;
            }
        }
    }

    // forward_returns[t] = close[t+h]/close[t] - 1 (the leak-free target).
    math::Matrix fwd = math::Matrix::like(close);
    const std::size_t h = static_cast<std::size_t>(horizon_);
    for (std::size_t j = 0; j < close.cols(); ++j) {
        for (std::size_t i = 0; i + h < close.rows(); ++i) {
            const double c0 = close.at(i, j), c1 = close.at(i + h, j);
            if (!math::is_nan(c0) && !math::is_nan(c1) && c0 != 0.0) {
                fwd.at(i, j) = c1 / c0 - 1.0;
            }
        }
    }

    FeatureSet fs;
    fs.dates = dates;
    fs.symbols = symbols;
    fs.fields.emplace("open", std::move(open));
    fs.fields.emplace("high", std::move(high));
    fs.fields.emplace("low", std::move(low));
    fs.fields.emplace("close", std::move(close));
    fs.fields.emplace("volume", std::move(volume));
    fs.fields.emplace("vwap", vwap.sanitized());
    fs.fields.emplace("dollar_volume", std::move(dollar_volume));
    fs.fields.emplace("returns", returns.sanitized());
    fs.forward_returns = fwd.sanitized();
    return fs;
}

}  // namespace alphaforge::data
