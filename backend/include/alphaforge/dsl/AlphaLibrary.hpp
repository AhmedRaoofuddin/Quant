#pragma once
///
/// \file AlphaLibrary.hpp
/// \brief Curated known-good alphas — few-shot examples for the LLM and the offline proposer.
///
#include <string>
#include <vector>

namespace alphaforge::dsl {

struct LibraryAlpha {
    std::string expression;
    std::string rationale;
};

/// A dozen genuine cross-sectional factors, each a valid DSL expression.
[[nodiscard]] const std::vector<LibraryAlpha>& alpha_library();

/// The field names the DSL exposes (open, high, low, close, volume, vwap, returns, dollar_volume).
[[nodiscard]] const std::vector<std::string>& dsl_fields();

}  // namespace alphaforge::dsl
