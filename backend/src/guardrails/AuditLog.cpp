#include "alphaforge/guardrails/AuditLog.hpp"

#include <filesystem>
#include <fstream>

#include "alphaforge/domain/Serialization.hpp"
#include "alphaforge/platform/Clock.hpp"
#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::guardrails {

namespace fs = std::filesystem;

AuditLog::AuditLog(std::string data_dir) {
    std::error_code ec;
    fs::create_directories(data_dir, ec);
    path_ = (fs::path(data_dir) / "audit.log").string();
}

void AuditLog::record(const domain::AuditEvent& event) noexcept {
    try {
        const std::string line = domain::to_json(event).dump();
        {
            std::lock_guard<std::mutex> lock(mutex_);
            std::ofstream out(path_, std::ios::app);
            out << line << '\n';
        }
        Logger::instance().info("audit", {field("actor", event.actor), field("action", event.action),
                                          field("resource", event.resource),
                                          field("outcome", event.outcome),
                                          field("sensitivity", std::string(to_string(event.sensitivity)))});
    } catch (const std::exception& e) {
        // Auditing must never break the request path; degrade to a log line.
        Logger::instance().error("audit.write_failed", {field("error", e.what())});
    }
}

void AuditLog::record(const std::string& actor, const std::string& action,
                      const std::string& resource, domain::Sensitivity sensitivity,
                      const std::string& outcome, const std::string& detail) noexcept {
    domain::AuditEvent event;
    event.timestamp = now_iso8601();
    event.actor = actor;
    event.action = action;
    event.resource = resource;
    event.sensitivity = sensitivity;
    event.outcome = outcome;
    event.detail = detail;
    record(event);
}

}  // namespace alphaforge::guardrails
