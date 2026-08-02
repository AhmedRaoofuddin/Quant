#pragma once
///
/// \file RiskReviewer.hpp
/// \brief Second-opinion agent (Phase 3: "A second AI reviews high-risk answers").
///
/// Interrogates each surviving alpha for overfitting and economic implausibility using
/// deterministic, auditable heuristics. The verdict is advisory and fully logged; it never
/// silently drops an alpha, it annotates it with a risk score and reasons.
///
#include <string>
#include <vector>

#include "alphaforge/domain/Types.hpp"

namespace alphaforge::proposer {

struct RiskVerdict {
    bool approved = true;
    double score = 1.0;             ///< confidence in [0,1] the alpha is genuine, not overfit.
    std::vector<std::string> reasons;
};

class RiskReviewer {
public:
    [[nodiscard]] RiskVerdict review(const domain::EvaluatedAlpha& alpha) const;
};

}  // namespace alphaforge::proposer
