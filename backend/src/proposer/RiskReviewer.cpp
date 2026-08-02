#include "alphaforge/proposer/RiskReviewer.hpp"

#include <algorithm>

#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::proposer {

RiskVerdict RiskReviewer::review(const domain::EvaluatedAlpha& alpha) const {
    RiskVerdict v;
    const auto& is_ = alpha.in_sample;
    double score = 1.0;
    bool sign_flip = false;

    // 1. In/out-of-sample Sharpe decay — the classic overfit tell.
    if (alpha.out_sample) {
        const double oos = alpha.out_sample->sharpe;
        if (is_.sharpe > 0 && oos < 0) {
            v.reasons.emplace_back("Sharpe flips sign out-of-sample (overfit).");
            score -= 0.5;
            sign_flip = true;
        } else if (is_.sharpe > 0 && oos < 0.3 * is_.sharpe) {
            v.reasons.emplace_back("Out-of-sample Sharpe decays over 70% (fragile).");
            score -= 0.3;
        }
    }

    // 2. Multiple-testing significance.
    if (is_.deflated_sharpe < 0.9) {
        v.reasons.emplace_back("Deflated Sharpe below 0.90 (may be noise).");
        score -= 0.2;
    }

    // 3. Turnover sanity — churn above 200%/day is a cost trap.
    if (is_.turnover > 2.0) {
        v.reasons.emplace_back("Turnover very high; cost-sensitive.");
        score -= 0.2;
    }

    // 4. Drawdown tolerance.
    if (is_.max_drawdown < -0.6) {
        v.reasons.emplace_back("Max drawdown exceeds risk budget.");
        score -= 0.2;
    }

    v.score = std::clamp(score, 0.0, 1.0);
    v.approved = v.score >= 0.5 && !sign_flip;
    if (v.reasons.empty()) v.reasons.emplace_back("Passes all risk heuristics.");

    Logger::instance().info("risk.review", {field("alpha_id", is_.alpha_id),
                                            field("approved", v.approved),
                                            field("score", v.score)});
    return v;
}

}  // namespace alphaforge::proposer
