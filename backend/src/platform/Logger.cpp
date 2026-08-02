#include "alphaforge/platform/Logger.hpp"

#include <chrono>
#include <ctime>
#include <iostream>
#include <sstream>

namespace alphaforge {

namespace {
const char* level_name(LogLevel l) {
    switch (l) {
        case LogLevel::Debug: return "debug";
        case LogLevel::Info:  return "info";
        case LogLevel::Warn:  return "warn";
        case LogLevel::Error: return "error";
    }
    return "info";
}

/// ISO-8601 UTC timestamp with second precision.
std::string iso_now() {
    const auto now = std::chrono::system_clock::now();
    const std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
#if defined(_WIN32)
    gmtime_s(&tm_utc, &t);
#else
    gmtime_r(&t, &tm_utc);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm_utc);
    return buf;
}

std::string json_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:   out += c;
        }
    }
    return out;
}
}  // namespace

Logger& Logger::instance() {
    static Logger logger;
    return logger;
}

void Logger::log(LogLevel level, const std::string& event, std::vector<LogField> fields) {
    if (static_cast<int>(level) < static_cast<int>(level_)) return;

    std::ostringstream os;
    if (json_) {
        os << "{\"ts\":\"" << iso_now() << "\",\"level\":\"" << level_name(level)
           << "\",\"event\":\"" << json_escape(event) << "\"";
        for (const auto& [k, v] : fields) {
            os << ",\"" << json_escape(k) << "\":\"" << json_escape(v) << "\"";
        }
        os << "}";
    } else {
        os << iso_now() << " [" << level_name(level) << "] " << event;
        for (const auto& [k, v] : fields) os << ' ' << k << '=' << v;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    std::ostream& sink = (level == LogLevel::Error || level == LogLevel::Warn) ? std::cerr : std::cout;
    sink << os.str() << '\n';
}

LogField field(std::string key, std::string value) { return {std::move(key), std::move(value)}; }
LogField field(std::string key, double value) { return {std::move(key), std::to_string(value)}; }
LogField field(std::string key, long value) { return {std::move(key), std::to_string(value)}; }
LogField field(std::string key, bool value) { return {std::move(key), value ? "true" : "false"}; }

}  // namespace alphaforge
