#pragma once
///
/// \file FeatureBuilder.hpp
/// \brief Turns tidy price bars into the wide FeatureSet the quant core consumes.
///
#include <vector>

#include "alphaforge/data/MarketData.hpp"

namespace alphaforge::data {

class FeatureBuilder {
public:
    /// \param forward_horizon days ahead the target return looks (default next-day).
    explicit FeatureBuilder(int forward_horizon = 1) : horizon_(forward_horizon) {}

    /// Build the aligned panel. Throws alphaforge::DataError on empty/degenerate input.
    [[nodiscard]] FeatureSet build(const std::vector<PriceBar>& bars) const;

private:
    int horizon_;
};

}  // namespace alphaforge::data
