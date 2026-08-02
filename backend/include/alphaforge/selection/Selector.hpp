#pragma once
///
/// \file Selector.hpp
/// \brief Turns a pile of evaluated alphas into a decorrelated, significant shortlist.
///
/// Guards against the two ways alpha mining fools you:
///   * statistical noise — rejects alphas below a Sharpe / deflated-Sharpe floor;
///   * redundancy — greedily prunes alphas whose return stream is too correlated with an
///     already-accepted one, so the book is not ten copies of the same bet.
///
#include <string>
#include <vector>

#include "alphaforge/domain/Types.hpp"

namespace alphaforge::selection {

/// One alpha plus the return stream used for correlation pruning.
struct Candidate {
    domain::EvaluatedAlpha eval;
    std::vector<std::string> dates;    ///< aligned to `returns`
    std::vector<double> returns;       ///< in-sample net returns
};

struct SelectionCriteria {
    double min_sharpe = 0.5;
    double min_deflated_sharpe = 0.90;
    double max_pairwise_corr = 0.7;
};

class Selector {
public:
    explicit Selector(SelectionCriteria criteria) : criteria_(criteria) {}

    /// Mutates each candidate's `eval.selected` / `eval.reject_reason` and returns the
    /// ids of the accepted alphas in priority order.
    std::vector<std::string> select(std::vector<Candidate>& candidates) const;

private:
    SelectionCriteria criteria_;
};

/// Pearson correlation of two return series aligned by date. Returns 0 if too little overlap.
[[nodiscard]] double correlation_by_date(const std::vector<std::string>& da,
                                         const std::vector<double>& a,
                                         const std::vector<std::string>& db,
                                         const std::vector<double>& b);

}  // namespace alphaforge::selection
