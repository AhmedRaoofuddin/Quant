#pragma once
///
/// \file Serialization.hpp
/// \brief JSON (de)serialisation for domain entities, kept out of the entities themselves.
///
#include "alphaforge/domain/Types.hpp"
#include "alphaforge/platform/Json.hpp"

namespace alphaforge::domain {

[[nodiscard]] Json to_json(const AlphaExpression& a);
[[nodiscard]] Json to_json(const AlphaMetrics& m);
[[nodiscard]] Json to_json(const EvaluatedAlpha& e);
[[nodiscard]] Json to_json(const Allocation& a);
[[nodiscard]] Json to_json(const BacktestResult& r);
[[nodiscard]] Json to_json(const DiscoveryRun& run);
[[nodiscard]] Json to_json(const AuditEvent& e);

[[nodiscard]] AlphaExpression alpha_from_json(const Json& j);

}  // namespace alphaforge::domain
