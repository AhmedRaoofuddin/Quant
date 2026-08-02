#include "alphaforge/dsl/Expression.hpp"

#include "alphaforge/dsl/AlphaLibrary.hpp"
#include "alphaforge/platform/Error.hpp"
#include "framework.hpp"

using alphaforge::DslError;
using alphaforge::dsl::Expression;
using alphaforge::dsl::dsl_fields;
using alphaforge::math::Matrix;

namespace {
std::map<std::string, Matrix> fields() {
    // 3 dates x 2 symbols close panel and a returns panel.
    Matrix close({"d1", "d2", "d3"}, {"a", "b"}, {10, 20, 11, 19, 12, 21});
    Matrix returns({"d1", "d2", "d3"}, {"a", "b"}, {0.0, 0.0, 0.1, -0.05, 0.09, 0.10});
    return {{"close", close}, {"returns", returns}};
}
}  // namespace

AF_TEST(dsl_parses_and_evaluates_to_matrix) {
    Expression e = Expression::parse("-1 * delta(close, 1)", dsl_fields());
    Matrix r = e.evaluate(fields());
    CHECK(r.rows() == 3);
    CHECK(r.cols() == 2);
}

AF_TEST(dsl_rejects_unknown_field) {
    CHECK_THROWS(Expression::parse("rank(unknownfield)", dsl_fields()), DslError);
}

AF_TEST(dsl_rejects_unknown_function) {
    CHECK_THROWS(Expression::parse("hack(close)", dsl_fields()), DslError);
}

AF_TEST(dsl_rejects_scalar_only_expression) {
    Expression e = Expression::parse("1 + 2", dsl_fields());
    CHECK_THROWS(e.evaluate(fields()), DslError);
}

AF_TEST(dsl_rejects_bad_arity) {
    CHECK_THROWS(Expression::parse("ts_mean(close)", dsl_fields()), DslError);
}

AF_TEST(dsl_whole_library_is_valid) {
    for (const auto& lib : alphaforge::dsl::alpha_library()) {
        // Should parse without throwing.
        const Expression e = Expression::parse(lib.expression, dsl_fields());
        CHECK(!e.source().empty());
    }
}

AF_TEST(dsl_rank_is_cross_sectional) {
    Expression e = Expression::parse("rank(close)", dsl_fields());
    Matrix r = e.evaluate(fields());
    // On d1, close a=10 < b=20, so rank(a) < rank(b).
    CHECK(r.at(0, 0) < r.at(0, 1));
}
