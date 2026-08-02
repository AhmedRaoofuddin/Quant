#pragma once
///
/// \file Allocator.hpp
/// \brief Portfolio allocation across selected alphas (Strategy pattern).
///
/// Each strategy turns per-alpha in-sample return streams into a set of weights that sum to 1.
/// The default is risk parity (inverse-volatility), which is robust and needs no fragile matrix
/// inversion; equal-weight and a diagonal mean-variance variant are also provided. A learned
/// RL allocator can implement the same interface without touching any caller.
///
#include <memory>
#include <string>
#include <vector>

#include "alphaforge/domain/Types.hpp"

namespace alphaforge::allocator {

/// Input to an allocator: an alpha id paired with its in-sample net return series.
struct AllocationInput {
    std::string alpha_id;
    std::vector<double> returns;
};

class IAllocator {
public:
    virtual ~IAllocator() = default;
    [[nodiscard]] virtual domain::Allocation allocate(const std::vector<AllocationInput>& inputs) const = 0;
    [[nodiscard]] virtual std::string name() const = 0;
};

class EqualWeightAllocator final : public IAllocator {
public:
    [[nodiscard]] domain::Allocation allocate(const std::vector<AllocationInput>&) const override;
    [[nodiscard]] std::string name() const override { return "equal"; }
};

/// Inverse-volatility weighting: quieter alphas get more capital.
class RiskParityAllocator final : public IAllocator {
public:
    [[nodiscard]] domain::Allocation allocate(const std::vector<AllocationInput>&) const override;
    [[nodiscard]] std::string name() const override { return "risk_parity"; }
};

/// Diagonal mean-variance: weight proportional to mean/variance, clipped to be long-only.
class MeanVarianceAllocator final : public IAllocator {
public:
    [[nodiscard]] domain::Allocation allocate(const std::vector<AllocationInput>&) const override;
    [[nodiscard]] std::string name() const override { return "mean_variance"; }
};

/// Factory: "equal" | "risk_parity" | "mean_variance" (throws ConfigurationError otherwise).
[[nodiscard]] std::unique_ptr<IAllocator> make_allocator(const std::string& method);

}  // namespace alphaforge::allocator
