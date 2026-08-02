#pragma once
///
/// \file framework.hpp
/// \brief A tiny zero-dependency test framework (registry + assertions + runner).
///
/// Kept in-tree so the project has no external test dependency. Register a case with AF_TEST,
/// assert with CHECK / CHECK_NEAR / CHECK_THROWS, and call aftest::run_all() from main.
///
#include <cmath>
#include <exception>
#include <functional>
#include <iostream>
#include <string>
#include <vector>

namespace aftest {

struct TestCase {
    std::string name;
    std::function<void()> fn;
};

inline std::vector<TestCase>& registry() {
    static std::vector<TestCase> cases;
    return cases;
}

struct Registrar {
    Registrar(const std::string& name, std::function<void()> fn) {
        registry().push_back({name, std::move(fn)});
    }
};

class AssertionError : public std::runtime_error {
public:
    explicit AssertionError(const std::string& msg) : std::runtime_error(msg) {}
};

inline void check(bool cond, const std::string& expr, const char* file, int line) {
    if (!cond) {
        throw AssertionError(std::string(file) + ":" + std::to_string(line) + "  CHECK(" + expr + ")");
    }
}

inline void check_near(double a, double b, double eps, const char* file, int line) {
    if (std::fabs(a - b) > eps) {
        throw AssertionError(std::string(file) + ":" + std::to_string(line) + "  CHECK_NEAR(" +
                             std::to_string(a) + ", " + std::to_string(b) + ")");
    }
}

inline int run_all() {
    int passed = 0, failed = 0;
    for (const auto& tc : registry()) {
        try {
            tc.fn();
            std::cout << "  [PASS] " << tc.name << "\n";
            ++passed;
        } catch (const std::exception& e) {
            std::cout << "  [FAIL] " << tc.name << "\n         " << e.what() << "\n";
            ++failed;
        }
    }
    std::cout << "\n" << passed << " passed, " << failed << " failed, "
              << registry().size() << " total.\n";
    return failed == 0 ? 0 : 1;
}

}  // namespace aftest

#define AF_TEST(name)                                                        \
    static void name();                                                      \
    static ::aftest::Registrar af_reg_##name(#name, name);                   \
    static void name()

#define CHECK(cond) ::aftest::check((cond), #cond, __FILE__, __LINE__)
#define CHECK_NEAR(a, b, eps) ::aftest::check_near((a), (b), (eps), __FILE__, __LINE__)
#define CHECK_THROWS(expr, ExceptionType)                                    \
    do {                                                                     \
        bool af_threw = false;                                               \
        try {                                                                \
            (void)(expr);                                                    \
        } catch (const ExceptionType&) {                                     \
            af_threw = true;                                                 \
        }                                                                    \
        ::aftest::check(af_threw, "throws " #ExceptionType, __FILE__, __LINE__); \
    } while (0)
