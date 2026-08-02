#include "alphaforge/allocator/Allocator.hpp"

#include <cmath>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::allocator {

namespace {
double mean_of(const std::vector<double>& v) {
    if (v.empty()) return 0.0;
    double s = 0;
    for (double x : v) s += x;
    return s / static_cast<double>(v.size());
}

double variance_of(const std::vector<double>& v) {
    if (v.size() < 2) return 0.0;
    const double m = mean_of(v);
    double sq = 0;
    for (double x : v) sq += (x - m) * (x - m);
    return sq / static_cast<double>(v.size() - 1);
}

domain::Allocation normalise(std::vector<std::pair<std::string, double>> raw,
                             const std::string& method) {
    double total = 0.0;
    for (auto& [id, w] : raw) {
        if (w < 0.0) w = 0.0;  // long-only across alphas
        total += w;
    }
    domain::Allocation alloc;
    alloc.method = method;
    if (total <= 0.0) {
        // Degenerate: fall back to equal weight.
        const double eq = raw.empty() ? 0.0 : 1.0 / static_cast<double>(raw.size());
        for (auto& [id, w] : raw) alloc.weights.emplace_back(id, eq);
        return alloc;
    }
    for (auto& [id, w] : raw) alloc.weights.emplace_back(id, w / total);
    return alloc;
}
}  // namespace

domain::Allocation EqualWeightAllocator::allocate(const std::vector<AllocationInput>& inputs) const {
    if (inputs.empty()) throw ComputeError("EqualWeightAllocator: no inputs");
    std::vector<std::pair<std::string, double>> raw;
    for (const auto& in : inputs) raw.emplace_back(in.alpha_id, 1.0);
    return normalise(std::move(raw), name());
}

domain::Allocation RiskParityAllocator::allocate(const std::vector<AllocationInput>& inputs) const {
    if (inputs.empty()) throw ComputeError("RiskParityAllocator: no inputs");
    std::vector<std::pair<std::string, double>> raw;
    for (const auto& in : inputs) {
        const double vol = std::sqrt(variance_of(in.returns));
        raw.emplace_back(in.alpha_id, vol > 1e-12 ? 1.0 / vol : 0.0);
    }
    return normalise(std::move(raw), name());
}

domain::Allocation MeanVarianceAllocator::allocate(const std::vector<AllocationInput>& inputs) const {
    if (inputs.empty()) throw ComputeError("MeanVarianceAllocator: no inputs");
    std::vector<std::pair<std::string, double>> raw;
    for (const auto& in : inputs) {
        const double var = variance_of(in.returns);
        const double mu = mean_of(in.returns);
        raw.emplace_back(in.alpha_id, var > 1e-12 ? mu / var : 0.0);
    }
    return normalise(std::move(raw), name());
}

std::unique_ptr<IAllocator> make_allocator(const std::string& method) {
    if (method == "equal") return std::make_unique<EqualWeightAllocator>();
    if (method == "risk_parity") return std::make_unique<RiskParityAllocator>();
    if (method == "mean_variance") return std::make_unique<MeanVarianceAllocator>();
    throw ConfigurationError("Unknown allocator method: " + method);
}

}  // namespace alphaforge::allocator
