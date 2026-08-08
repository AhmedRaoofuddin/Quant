#pragma once
///
/// \file DataSource.hpp
/// \brief Abstraction over where market data comes from (Dependency Inversion).
///
/// The pipeline depends only on this interface, never on a concrete vendor. Implementations:
///   * SyntheticDataSource — deterministic, offline, for tests/CI/demos.
///   * CsvDataSource       — reads bars a crawler has written to disk.
///   * (production) an HTTP vendor adapter behind the same interface.
///
#include <string>
#include <vector>

#include "alphaforge/data/MarketData.hpp"

namespace alphaforge::data {

class IDataSource {
public:
    virtual ~IDataSource() = default;

    /// Fetch daily bars for \p symbols over [start, end] (inclusive, ISO dates).
    /// Implementations throw alphaforge::DataError on unrecoverable failure.
    [[nodiscard]] virtual std::vector<PriceBar> fetch(
        const std::vector<std::string>& symbols,
        const std::string& start,
        const std::string& end) = 0;

    [[nodiscard]] virtual std::string name() const = 0;
};

}  // namespace alphaforge::data
