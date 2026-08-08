#pragma once
///
/// \file SyntheticDataSource.hpp
/// \brief Deterministic synthetic market data (GBM with a shared factor).
///
/// Given the same (symbols, start, end, seed) it always produces identical bars, which makes
/// the entire platform reproducible offline — a hard requirement for the audit trail and for
/// deterministic CI. A mild autocorrelation and cross-sectional structure are injected so mined
/// alphas find *something*; this is a sandbox, never a claim of real edge.
///
#include <cstdint>

#include "alphaforge/data/DataSource.hpp"

namespace alphaforge::data {

class SyntheticDataSource final : public IDataSource {
public:
    explicit SyntheticDataSource(std::uint64_t seed = 42) : seed_(seed) {}

    [[nodiscard]] std::vector<PriceBar> fetch(
        const std::vector<std::string>& symbols,
        const std::string& start,
        const std::string& end) override;

    [[nodiscard]] std::string name() const override { return "synthetic"; }

private:
    std::uint64_t seed_;
};

}  // namespace alphaforge::data
