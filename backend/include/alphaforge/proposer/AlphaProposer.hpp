#pragma once
///
/// \file AlphaProposer.hpp
/// \brief Generates candidate alphas — via Claude when configured, else an offline library.
///
/// Robustness (Phase 2 "auto-retry and safe backup if a step fails"): if there is no API key,
/// or the LLM call fails, the proposer degrades to a curated template engine so the pipeline
/// always yields candidates. Every expression — LLM or template — is validated against the DSL
/// before it leaves this class; anything that does not parse is discarded, never executed
/// (Phase 3 guardrail).
///
#include <string>
#include <vector>

#include "alphaforge/domain/Types.hpp"

namespace alphaforge::proposer {

struct ProposerConfig {
    bool offline = true;         ///< true -> never call the network.
    std::string api_key;         ///< Anthropic key; empty forces offline.
    std::string model = "claude-opus-5";
    std::string cache_dir = "data/cache";
};

class AlphaProposer {
public:
    explicit AlphaProposer(ProposerConfig config);

    /// Propose up to \p n validated alphas, avoiding any expression in \p avoid.
    [[nodiscard]] std::vector<domain::AlphaExpression> propose(
        int n, const std::vector<std::string>& avoid = {}) const;

    /// True if this proposer will actually reach the Claude API.
    [[nodiscard]] bool uses_llm() const;

private:
    [[nodiscard]] std::vector<domain::AlphaExpression> from_library(
        int n, const std::vector<std::string>& avoid) const;
    [[nodiscard]] std::vector<domain::AlphaExpression> from_llm(
        int n, const std::vector<std::string>& avoid) const;

    ProposerConfig config_;
};

}  // namespace alphaforge::proposer
