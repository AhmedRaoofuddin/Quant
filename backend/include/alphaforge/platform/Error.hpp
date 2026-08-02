#pragma once
///
/// \file Error.hpp
/// \brief Typed exception hierarchy for Alpha-Forge.
///
/// Every recoverable failure in the system is expressed as an exception derived from
/// alphaforge::Error. Layers catch the narrowest type they can handle and rethrow or wrap
/// the rest, so the top-level handlers in the CLI / API can map an error category to an exit
/// code or HTTP status without string-matching messages. This directly supports the deck's
/// "Auto-retry and safe backup if a step fails (Failure Handling, Error Notification & Log)".
///
#include <stdexcept>
#include <string>
#include <utility>

namespace alphaforge {

/// Broad category used by top-level handlers to decide how to react (exit code / HTTP status).
enum class ErrorCategory {
    Configuration,  ///< Missing or invalid configuration / environment.
    Data,           ///< Ingestion, parsing, or persistence failure.
    Dsl,            ///< Invalid alpha expression (syntax or disallowed construct).
    Compute,        ///< Numerical / backtest failure.
    Guardrail,      ///< A request was blocked by a safety guardrail.
    External,       ///< Failure calling an external service (LLM, data vendor).
    Internal        ///< Programming error / invariant violation.
};

/// Base class for all Alpha-Forge exceptions. Carries a category for structured handling.
class Error : public std::runtime_error {
public:
    Error(ErrorCategory category, std::string message)
        : std::runtime_error(std::move(message)), category_(category) {}

    [[nodiscard]] ErrorCategory category() const noexcept { return category_; }

private:
    ErrorCategory category_;
};

/// Configuration missing or invalid (e.g. production secrets not injected).
class ConfigurationError : public Error {
public:
    explicit ConfigurationError(std::string message)
        : Error(ErrorCategory::Configuration, std::move(message)) {}
};

/// Data ingestion, parsing, or persistence failed.
class DataError : public Error {
public:
    explicit DataError(std::string message)
        : Error(ErrorCategory::Data, std::move(message)) {}
};

/// An alpha expression violated the DSL grammar or referenced an unknown field/function.
class DslError : public Error {
public:
    explicit DslError(std::string message)
        : Error(ErrorCategory::Dsl, std::move(message)) {}
};

/// A numerical or backtest computation failed irrecoverably.
class ComputeError : public Error {
public:
    explicit ComputeError(std::string message)
        : Error(ErrorCategory::Compute, std::move(message)) {}
};

/// A request or response was rejected by a safety guardrail (Phase 3).
class GuardrailError : public Error {
public:
    explicit GuardrailError(std::string message)
        : Error(ErrorCategory::Guardrail, std::move(message)) {}
};

/// A call to an external dependency (LLM API, data vendor) failed after retries.
class ExternalServiceError : public Error {
public:
    explicit ExternalServiceError(std::string message)
        : Error(ErrorCategory::External, std::move(message)) {}
};

/// An internal invariant was violated — indicates a bug, not user input.
class InternalError : public Error {
public:
    explicit InternalError(std::string message)
        : Error(ErrorCategory::Internal, std::move(message)) {}
};

/// Human-readable name for a category (used in logs and API error payloads).
[[nodiscard]] constexpr const char* to_string(ErrorCategory c) noexcept {
    switch (c) {
        case ErrorCategory::Configuration: return "configuration";
        case ErrorCategory::Data:          return "data";
        case ErrorCategory::Dsl:           return "dsl";
        case ErrorCategory::Compute:       return "compute";
        case ErrorCategory::Guardrail:     return "guardrail";
        case ErrorCategory::External:      return "external";
        case ErrorCategory::Internal:      return "internal";
    }
    return "unknown";
}

}  // namespace alphaforge
