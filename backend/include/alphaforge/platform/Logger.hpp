#pragma once
///
/// \file Logger.hpp
/// \brief Minimal structured logger (Phase 3 activity record / Phase 6 observability).
///
/// Emits one line per event. In production (AF_LOG_JSON=1) each line is JSON so it ships
/// cleanly to a central log store; otherwise a readable key=value form is used for dev.
/// Thread-safe: a single mutex serialises writes to stdout.
///
#include <initializer_list>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace alphaforge {

enum class LogLevel { Debug, Info, Warn, Error };

/// A key/value pair attached to a log event (values are pre-stringified).
using LogField = std::pair<std::string, std::string>;

class Logger {
public:
    /// Access the process-wide logger.
    static Logger& instance();

    void set_level(LogLevel level) noexcept { level_ = level; }
    void set_json(bool json) noexcept { json_ = json; }

    void log(LogLevel level, const std::string& event, std::vector<LogField> fields = {});

    void debug(const std::string& e, std::vector<LogField> f = {}) { log(LogLevel::Debug, e, std::move(f)); }
    void info(const std::string& e, std::vector<LogField> f = {}) { log(LogLevel::Info, e, std::move(f)); }
    void warn(const std::string& e, std::vector<LogField> f = {}) { log(LogLevel::Warn, e, std::move(f)); }
    void error(const std::string& e, std::vector<LogField> f = {}) { log(LogLevel::Error, e, std::move(f)); }

private:
    Logger() = default;

    LogLevel level_ = LogLevel::Info;
    bool json_ = false;
    std::mutex mutex_;
};

/// Convenience helpers to build fields of common types.
LogField field(std::string key, std::string value);
LogField field(std::string key, double value);
LogField field(std::string key, long value);
LogField field(std::string key, bool value);

}  // namespace alphaforge
