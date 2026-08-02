#pragma once
///
/// \file Guardrails.hpp
/// \brief Safety checks on the way in to the AI and on the way back out (Phase 3).
///
/// InputGuard   — blocks jailbreak/injection attempts, redacts PII, and (for alphas) rejects
///                anything that is not a valid DSL expression BEFORE it is ever evaluated.
/// OutputGuard  — re-validates model output against the DSL grammar (defence in depth): an
///                expression that does not parse against the known field set is "made-up" and
///                is discarded.
/// RateLimiter  — caps how often each actor/task may run (sliding one-minute window).
///
#include <deque>
#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace alphaforge::guardrails {

class InputGuard {
public:
    explicit InputGuard(std::vector<std::string> allowed_fields)
        : allowed_fields_(std::move(allowed_fields)) {}

    /// Validate an alpha expression. Throws GuardrailError if it is not a legal DSL formula.
    void check_alpha(const std::string& expression) const;

    /// Redact obvious PII (emails, long digit runs) from free text destined for the LLM.
    [[nodiscard]] std::string redact_pii(const std::string& text) const;

    /// Reject known prompt-injection / jailbreak phrasing. Throws GuardrailError on a hit.
    void check_prompt(const std::string& text) const;

private:
    std::vector<std::string> allowed_fields_;
};

class OutputGuard {
public:
    explicit OutputGuard(std::vector<std::string> allowed_fields)
        : allowed_fields_(std::move(allowed_fields)) {}

    /// True if \p expression is a valid DSL formula over the known fields.
    [[nodiscard]] bool is_valid_alpha(const std::string& expression) const;

private:
    std::vector<std::string> allowed_fields_;
};

/// Thread-safe sliding-window rate limiter, keyed by actor id.
class RateLimiter {
public:
    explicit RateLimiter(int max_per_minute) : max_per_minute_(max_per_minute) {}

    /// Returns true if the actor is under the limit, recording the hit; false if throttled.
    [[nodiscard]] bool allow(const std::string& actor);

private:
    int max_per_minute_;
    std::mutex mutex_;
    std::map<std::string, std::deque<long long>> hits_;  ///< actor -> epoch-second timestamps
};

}  // namespace alphaforge::guardrails
