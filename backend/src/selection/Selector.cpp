#include "alphaforge/selection/Selector.hpp"

#include <algorithm>
#include <cmath>
#include <map>

#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::selection {

double correlation_by_date(const std::vector<std::string>& da, const std::vector<double>& a,
                           const std::vector<std::string>& db, const std::vector<double>& b) {
    std::map<std::string, double> lookup;
    for (std::size_t i = 0; i < db.size(); ++i) lookup[db[i]] = b[i];

    std::vector<double> xs, ys;
    for (std::size_t i = 0; i < da.size(); ++i) {
        auto it = lookup.find(da[i]);
        if (it != lookup.end()) {
            xs.push_back(a[i]);
            ys.push_back(it->second);
        }
    }
    if (xs.size() < 10) return 0.0;

    const auto n = static_cast<double>(xs.size());
    double sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (std::size_t i = 0; i < xs.size(); ++i) {
        sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; sxy += xs[i] * ys[i];
    }
    const double cov = sxy - sx * sy / n;
    const double vx = sxx - sx * sx / n;
    const double vy = syy - sy * sy / n;
    const double denom = std::sqrt(vx * vy);
    return denom > 0 ? cov / denom : 0.0;
}

std::vector<std::string> Selector::select(std::vector<Candidate>& candidates) const {
    // Rank by significance first (deflated Sharpe), then raw Sharpe.
    std::sort(candidates.begin(), candidates.end(), [](const Candidate& x, const Candidate& y) {
        if (x.eval.in_sample.deflated_sharpe != y.eval.in_sample.deflated_sharpe) {
            return x.eval.in_sample.deflated_sharpe > y.eval.in_sample.deflated_sharpe;
        }
        return x.eval.in_sample.sharpe > y.eval.in_sample.sharpe;
    });

    std::vector<std::string> accepted_ids;
    std::vector<const Candidate*> accepted;
    auto& log = Logger::instance();

    for (auto& cand : candidates) {
        const auto& m = cand.eval.in_sample;
        if (m.sharpe < criteria_.min_sharpe) {
            cand.eval.selected = false;
            cand.eval.reject_reason = "Sharpe " + std::to_string(m.sharpe) + " below floor";
            continue;
        }
        if (m.deflated_sharpe < criteria_.min_deflated_sharpe) {
            cand.eval.selected = false;
            cand.eval.reject_reason =
                "Deflated Sharpe " + std::to_string(m.deflated_sharpe) + " below floor";
            continue;
        }
        // Correlation pruning against everything already accepted.
        double max_corr = 0.0;
        for (const Candidate* prev : accepted) {
            const double c = std::fabs(correlation_by_date(cand.dates, cand.returns,
                                                           prev->dates, prev->returns));
            max_corr = std::max(max_corr, c);
        }
        if (max_corr > criteria_.max_pairwise_corr) {
            cand.eval.selected = false;
            cand.eval.reject_reason =
                "Correlation " + std::to_string(max_corr) + " with an accepted alpha";
            continue;
        }
        cand.eval.selected = true;
        cand.eval.reject_reason.clear();
        accepted.push_back(&cand);
        accepted_ids.push_back(cand.eval.expression.id);
    }

    log.info("selection.done", {field("candidates", static_cast<long>(candidates.size())),
                                field("accepted", static_cast<long>(accepted_ids.size()))});
    return accepted_ids;
}

}  // namespace alphaforge::selection
