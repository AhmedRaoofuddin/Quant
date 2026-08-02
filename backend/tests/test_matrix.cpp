#include "alphaforge/math/Matrix.hpp"

#include "alphaforge/platform/Error.hpp"
#include "framework.hpp"

using alphaforge::math::Matrix;
using alphaforge::math::is_nan;

namespace {
Matrix make(std::vector<std::string> rows, std::vector<std::string> cols, std::vector<double> d) {
    return Matrix(std::move(rows), std::move(cols), std::move(d));
}
}  // namespace

AF_TEST(matrix_cross_sectional_rank) {
    // One row: values 10, 20, 30 -> ranks should be increasing in (0,1].
    Matrix m = make({"d1"}, {"a", "b", "c"}, {10, 20, 30});
    Matrix r = m.cs_rank();
    CHECK(r.at(0, 0) < r.at(0, 1));
    CHECK(r.at(0, 1) < r.at(0, 2));
    CHECK(r.at(0, 2) <= 1.0);
}

AF_TEST(matrix_demean_is_zero_sum) {
    Matrix m = make({"d1"}, {"a", "b", "c"}, {1, 2, 6});
    Matrix d = m.cs_demean();
    double sum = d.at(0, 0) + d.at(0, 1) + d.at(0, 2);
    CHECK_NEAR(sum, 0.0, 1e-9);
}

AF_TEST(matrix_scale_unit_gross) {
    Matrix m = make({"d1"}, {"a", "b", "c"}, {-2, 1, 1});
    Matrix s = m.cs_scale(1.0);
    double gross = std::fabs(s.at(0, 0)) + std::fabs(s.at(0, 1)) + std::fabs(s.at(0, 2));
    CHECK_NEAR(gross, 1.0, 1e-9);
}

AF_TEST(matrix_ts_delta_and_shift) {
    Matrix m = make({"d1", "d2", "d3"}, {"a"}, {10, 12, 15});
    Matrix d = m.ts_delta(1);
    CHECK(is_nan(d.at(0, 0)));       // no prior value
    CHECK_NEAR(d.at(1, 0), 2.0, 1e-9);
    CHECK_NEAR(d.at(2, 0), 3.0, 1e-9);
}

AF_TEST(matrix_ts_mean_window) {
    Matrix m = make({"d1", "d2", "d3", "d4"}, {"a"}, {2, 4, 6, 8});
    Matrix mean = m.ts_mean(2);
    CHECK_NEAR(mean.at(1, 0), 3.0, 1e-9);  // (2+4)/2
    CHECK_NEAR(mean.at(3, 0), 7.0, 1e-9);  // (6+8)/2
}

AF_TEST(matrix_shape_mismatch_throws) {
    Matrix a = make({"d1"}, {"x"}, {1});
    Matrix b = make({"d1"}, {"x", "y"}, {1, 2});
    CHECK_THROWS(a + b, alphaforge::ComputeError);
}
