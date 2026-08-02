#pragma once
///
/// \file Pipeline.hpp
/// \brief End-to-end alpha-discovery orchestration.
///
/// Flow: crawl/load prices -> features -> in/out-of-sample split -> propose alphas ->
/// guardrail -> backtest (in & out of sample) -> second-AI risk review -> select
/// (significance + decorrelation) -> allocate -> out-of-sample portfolio backtest ->
/// persist + audit. Dependencies are injected (data source, run repository, audit log) so the
/// pipeline is unit-testable with fakes.
///
#include <string>
#include <vector>

#include "alphaforge/data/DataSource.hpp"
#include "alphaforge/data/Repository.hpp"
#include "alphaforge/domain/Types.hpp"
#include "alphaforge/guardrails/AuditLog.hpp"
#include "alphaforge/platform/Config.hpp"

namespace alphaforge::app {

struct PipelineOptions {
    int n_alphas = 8;
    std::string allocator_method = "risk_parity";
    int forward_horizon = 1;
};

class Pipeline {
public:
    Pipeline(const Config& config, data::IDataSource& source, data::IRunRepository& runs,
             guardrails::AuditLog& audit);

    /// Run a full discovery over \p universe / [start, end]. \p actor is recorded in the audit
    /// trail. Throws alphaforge::Error subclasses on unrecoverable failure.
    [[nodiscard]] domain::DiscoveryRun run(const std::vector<std::string>& universe,
                                           const std::string& start, const std::string& end,
                                           const std::string& actor,
                                           const PipelineOptions& options = {});

private:
    const Config& config_;
    data::IDataSource& source_;
    data::IRunRepository& runs_;
    guardrails::AuditLog& audit_;
};

}  // namespace alphaforge::app
