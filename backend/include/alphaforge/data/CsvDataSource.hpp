#pragma once
///
/// \file CsvDataSource.hpp
/// \brief Reads OHLCV bars from per-symbol CSV files a crawler has persisted.
///
/// Layout: <root>/<SYMBOL>.csv with header `date,open,high,low,close,volume`. This is the
/// bridge between the crawler (which writes) and the pipeline (which reads).
///
#include <string>

#include "alphaforge/data/DataSource.hpp"

namespace alphaforge::data {

class CsvDataSource final : public IDataSource {
public:
    explicit CsvDataSource(std::string root) : root_(std::move(root)) {}

    [[nodiscard]] std::vector<PriceBar> fetch(
        const std::vector<std::string>& symbols,
        const std::string& start,
        const std::string& end) override;

    [[nodiscard]] std::string name() const override { return "csv"; }

private:
    std::string root_;
};

}  // namespace alphaforge::data
