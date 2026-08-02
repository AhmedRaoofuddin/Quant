#pragma once
///
/// \file AuditLog.hpp
/// \brief Append-only audit trail (Phase 3): who asked what, when, tagged by sensitivity.
///
/// Records are appended as JSON lines to <data_dir>/audit.log and mirrored to the structured
/// logger. In production the same events are also written to alphaforge.audit_events in Supabase.
///
#include <mutex>
#include <string>

#include "alphaforge/domain/Types.hpp"

namespace alphaforge::guardrails {

class AuditLog {
public:
    explicit AuditLog(std::string data_dir);

    /// Record an event. Thread-safe; never throws out (failures are logged, not propagated,
    /// so auditing can never break the primary request path).
    void record(const domain::AuditEvent& event) noexcept;

    /// Convenience helper that stamps the timestamp for the caller.
    void record(const std::string& actor, const std::string& action, const std::string& resource,
                domain::Sensitivity sensitivity, const std::string& outcome = "ok",
                const std::string& detail = "") noexcept;

private:
    std::string path_;
    std::mutex mutex_;
};

}  // namespace alphaforge::guardrails
