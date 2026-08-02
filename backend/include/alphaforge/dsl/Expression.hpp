#pragma once
///
/// \file Expression.hpp
/// \brief The Alpha DSL public surface: parse, validate, and evaluate formulaic alphas.
///
/// Grammar (EBNF):
///   expr    := term (('+' | '-') term)*
///   term    := factor (('*' | '/') factor)*
///   factor  := ['-' | '+'] primary
///   primary := number | field | call | '(' expr ')'
///   call    := identifier '(' [expr (',' expr)*] ')'
///
/// Only whitelisted field names and functions are accepted; anything else raises
/// alphaforge::DslError *before* evaluation. This is the security boundary that lets the LLM
/// propose alphas as text we can safely execute (Phase 3 guardrail).
///
#include <map>
#include <string>
#include <vector>

#include "alphaforge/dsl/Ast.hpp"
#include "alphaforge/math/Matrix.hpp"

namespace alphaforge::dsl {

/// Names of every function the DSL supports (used by the proposer prompt and validation).
[[nodiscard]] const std::vector<std::string>& function_names();

/// A parsed, validated alpha expression.
class Expression {
public:
    /// Parse and validate \p source against \p allowed_fields. Throws DslError on any problem.
    [[nodiscard]] static Expression parse(const std::string& source,
                                          const std::vector<std::string>& allowed_fields);

    /// Evaluate against a field dictionary (name -> panel). Throws DslError/ComputeError.
    /// The result is guaranteed to be a matrix (a scalar-only expression is rejected).
    [[nodiscard]] math::Matrix evaluate(const std::map<std::string, math::Matrix>& fields) const;

    [[nodiscard]] const std::string& source() const noexcept { return source_; }

private:
    Expression(detail::NodePtr root, std::string source)
        : root_(std::move(root)), source_(std::move(source)) {}

    detail::NodePtr root_;
    std::string source_;
};

/// Validate syntax and field/function usage without evaluating (used by the input guardrail).
void validate(const std::string& source, const std::vector<std::string>& allowed_fields);

}  // namespace alphaforge::dsl
