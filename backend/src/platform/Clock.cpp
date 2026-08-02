#include "alphaforge/platform/Clock.hpp"

#include <chrono>
#include <ctime>

namespace alphaforge {

namespace {
std::string format_utc(const char* fmt) {
    const auto now = std::chrono::system_clock::now();
    const std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
#if defined(_WIN32)
    gmtime_s(&tm_utc, &t);
#else
    gmtime_r(&t, &tm_utc);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), fmt, &tm_utc);
    return buf;
}
}  // namespace

std::string now_iso8601() { return format_utc("%Y-%m-%dT%H:%M:%SZ"); }

std::string make_run_id(const std::string& suffix) {
    std::string id = "run_" + format_utc("%Y%m%dT%H%M%SZ");
    if (!suffix.empty()) id += "_" + suffix;
    return id;
}

}  // namespace alphaforge
