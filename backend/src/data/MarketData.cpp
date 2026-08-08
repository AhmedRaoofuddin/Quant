#include "alphaforge/data/MarketData.hpp"

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::data {

namespace {
/// Row-slice a matrix to rows [begin, end), preserving column labels.
math::Matrix slice_rows(const math::Matrix& m, std::size_t begin, std::size_t end) {
    if (begin > end || end > m.rows()) throw ComputeError("slice_rows out of range");
    std::vector<std::string> rows(m.row_labels().begin() + static_cast<long>(begin),
                                  m.row_labels().begin() + static_cast<long>(end));
    math::Matrix out(rows, m.col_labels());
    for (std::size_t i = begin; i < end; ++i) {
        for (std::size_t j = 0; j < m.cols(); ++j) out.at(i - begin, j) = m.at(i, j);
    }
    return out;
}
}  // namespace

const math::Matrix& FeatureSet::field(const std::string& name) const {
    auto it = fields.find(name);
    if (it == fields.end()) throw DataError("Unknown feature field: " + name);
    return it->second;
}

FeatureSet FeatureSet::slice(std::size_t begin, std::size_t end) const {
    if (begin > end || end > dates.size()) throw ComputeError("FeatureSet::slice out of range");
    FeatureSet out;
    out.symbols = symbols;
    out.dates.assign(dates.begin() + static_cast<long>(begin), dates.begin() + static_cast<long>(end));
    for (const auto& [name, m] : fields) out.fields[name] = slice_rows(m, begin, end);
    out.forward_returns = slice_rows(forward_returns, begin, end);
    return out;
}

}  // namespace alphaforge::data
