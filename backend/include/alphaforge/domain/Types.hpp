#pragma once
///
/// \file Types.hpp
/// \brief Domain entities — the single agreed data model at the centre of every module
///        (Phase 2: "One agreed definition for every part").
///
/// These are plain value types with no behaviour and no I/O. Serialisation lives in
/// domain/Serialization.hpp so the entities stay free of any transport concern.
///
#include <optional>
#include <string>
#include <vector>

namespace alphaforge::domain {

/// Data classification for the audit trail (Phase 3).
enum class Sensitivity { Public, Internal, Confidential };

/// RBAC roles (Phase 3: access by role, least privilege).
enum class Role { Viewer, Analyst, Admin };

/// A candidate signal expressed as an auditable formula in the Alpha DSL.
struct AlphaExpression {
    std::string id;
    std::string expression;
    std::string rationale;
    std::string proposed_by = "template";  ///< llm | template | human
    std::string created_at;                ///< ISO-8601
};

/// Performance scorecard for one alpha over one backtest window.
struct AlphaMetrics {
    std::string alpha_id;
    double sharpe = 0.0;
    double ann_return = 0.0;
    double ann_vol = 0.0;
    double max_drawdown = 0.0;
    double turnover = 0.0;
    double ic_mean = 0.0;   ///< mean information coefficient (rank corr with fwd return).
    double ic_ir = 0.0;     ///< IC information ratio = mean(IC)/std(IC).
    long n_obs = 0;
    double deflated_sharpe = 0.0;  ///< probability true Sharpe > 0 after multiple-testing adj.
};

/// An alpha plus its in-sample and out-of-sample scorecards and a selection decision.
struct EvaluatedAlpha {
    AlphaExpression expression;
    AlphaMetrics in_sample;
    std::optional<AlphaMetrics> out_sample;
    bool selected = false;
    std::string reject_reason;
    double risk_score = 0.0;  ///< second-AI reviewer confidence in [0,1].
};

/// Portfolio weights across selected alphas.
struct Allocation {
    std::vector<std::pair<std::string, double>> weights;  ///< alpha_id -> weight (sums to 1).
    std::string method;  ///< risk_parity | mean_variance | equal | rl_ppo
    double expected_sharpe = 0.0;
};

/// The end-to-end result of a combined-portfolio backtest.
struct BacktestResult {
    AlphaMetrics metrics;
    std::vector<std::string> dates;
    std::vector<double> equity_curve;
    Allocation allocation;
};

/// A full pipeline execution record (Phase 6: everything logged & reproducible).
struct DiscoveryRun {
    std::string run_id;
    std::vector<std::string> universe;
    std::string start_date;
    std::string end_date;
    int n_proposed = 0;
    int n_selected = 0;
    std::vector<EvaluatedAlpha> alphas;
    std::optional<BacktestResult> result;
    std::string region = "uae-north";
    std::string started_at;
    std::string finished_at;
};

/// Immutable audit record (Phase 3).
struct AuditEvent {
    std::string timestamp;
    std::string actor;
    std::string action;
    std::string resource;
    Sensitivity sensitivity = Sensitivity::Internal;
    std::string outcome = "ok";  ///< ok | blocked | error
    std::string detail;
};

[[nodiscard]] const char* to_string(Sensitivity s) noexcept;
[[nodiscard]] const char* to_string(Role r) noexcept;
[[nodiscard]] Role role_from_string(const std::string& s);

}  // namespace alphaforge::domain
