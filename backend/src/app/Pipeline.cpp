#include "alphaforge/app/Pipeline.hpp"

#include <algorithm>
#include <map>

#include "alphaforge/allocator/Allocator.hpp"
#include "alphaforge/data/FeatureBuilder.hpp"
#include "alphaforge/dsl/AlphaLibrary.hpp"
#include "alphaforge/dsl/Expression.hpp"
#include "alphaforge/domain/Serialization.hpp"
#include "alphaforge/engine/Backtester.hpp"
#include "alphaforge/guardrails/Guardrails.hpp"
#include "alphaforge/proposer/AlphaProposer.hpp"
#include "alphaforge/proposer/RiskReviewer.hpp"
#include "alphaforge/selection/Selector.hpp"
#include "alphaforge/platform/Clock.hpp"
#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::app {

using namespace alphaforge::domain;

Pipeline::Pipeline(const Config& config, data::IDataSource& source, data::IRunRepository& runs,
                   guardrails::AuditLog& audit)
    : config_(config), source_(source), runs_(runs), audit_(audit) {}

DiscoveryRun Pipeline::run(const std::vector<std::string>& universe, const std::string& start,
                           const std::string& end, const std::string& actor,
                           const PipelineOptions& options) {
    auto& log = Logger::instance();
    DiscoveryRun run;
    run.run_id = make_run_id();
    run.universe = universe;
    run.start_date = start;
    run.end_date = end;
    run.region = config_.region;
    run.started_at = now_iso8601();

    audit_.record(actor, "discovery.start", run.run_id, Sensitivity::Internal);
    log.info("pipeline.start", {field("run_id", run.run_id),
                                field("symbols", static_cast<long>(universe.size()))});

    // 1. Data -> features.
    const std::vector<data::PriceBar> bars = source_.fetch(universe, start, end);
    const data::FeatureSet features = data::FeatureBuilder(options.forward_horizon).build(bars);
    if (features.dates.size() < 60) {
        throw DataError("Not enough history to run discovery (need >= 60 dates)");
    }

    // 2. In / out-of-sample split.
    const std::size_t split =
        static_cast<std::size_t>(static_cast<double>(features.dates.size()) * config_.in_sample_fraction);
    const data::FeatureSet in_sample = features.slice(0, split);
    const data::FeatureSet out_sample = features.slice(split, features.dates.size());
    log.info("pipeline.split", {field("in_sample", static_cast<long>(split)),
                                field("out_sample", static_cast<long>(features.dates.size() - split))});

    // 3. Propose alphas.
    proposer::ProposerConfig pc;
    pc.offline = config_.llm_offline || config_.anthropic_api_key.empty();
    pc.api_key = config_.anthropic_api_key;
    pc.model = config_.llm_model;
    pc.cache_dir = config_.cache_dir;
    const proposer::AlphaProposer alpha_proposer(pc);
    const std::vector<AlphaExpression> proposed = alpha_proposer.propose(options.n_alphas);
    run.n_proposed = static_cast<int>(proposed.size());

    // 4. Guardrail + backtest each alpha (in & out of sample).
    const guardrails::InputGuard input_guard(dsl::dsl_fields());
    const proposer::RiskReviewer reviewer;
    const engine::Backtester backtester(config_.transaction_cost_bps);
    const int n_trials = std::max(1, run.n_proposed);

    std::vector<selection::Candidate> candidates;
    std::map<std::string, math::Matrix> out_signals;  // id -> out-of-sample signal

    for (const auto& expr : proposed) {
        try {
            input_guard.check_alpha(expr.expression);  // defence in depth
            const dsl::Expression compiled = dsl::Expression::parse(expr.expression, dsl::dsl_fields());

            const math::Matrix sig_in = compiled.evaluate(in_sample.fields);
            const engine::BacktestOutput bt_in =
                backtester.run(sig_in, in_sample.forward_returns, expr.id, n_trials);

            const math::Matrix sig_out = compiled.evaluate(out_sample.fields);
            const engine::BacktestOutput bt_out =
                backtester.run(sig_out, out_sample.forward_returns, expr.id, 1);

            EvaluatedAlpha ev;
            ev.expression = expr;
            ev.in_sample = bt_in.metrics;
            ev.out_sample = bt_out.metrics;

            const proposer::RiskVerdict verdict = reviewer.review(ev);
            ev.risk_score = verdict.score;

            selection::Candidate cand;
            cand.eval = ev;
            cand.dates = bt_in.dates;
            cand.returns = bt_in.net_returns;
            candidates.push_back(std::move(cand));
            out_signals.emplace(expr.id, sig_out);
        } catch (const Error& e) {
            log.warn("pipeline.alpha_skipped",
                     {field("expression", expr.expression), field("error", e.what())});
            audit_.record(actor, "alpha.blocked", expr.id, Sensitivity::Internal, "blocked", e.what());
        }
    }
    if (candidates.empty()) throw ComputeError("No alpha survived evaluation");

    // 5. Select (significance + decorrelation).
    selection::SelectionCriteria criteria;
    criteria.min_sharpe = config_.min_sharpe;
    criteria.min_deflated_sharpe = config_.min_deflated_sharpe;
    criteria.max_pairwise_corr = config_.max_pairwise_corr;
    const std::vector<std::string> selected_ids = selection::Selector(criteria).select(candidates);

    // Collect the evaluated alphas back into the run (selection mutated them in place).
    for (const auto& cand : candidates) run.alphas.push_back(cand.eval);
    run.n_selected = static_cast<int>(selected_ids.size());

    // 6. Allocate over the selected alphas' in-sample returns.
    if (!selected_ids.empty()) {
        std::vector<allocator::AllocationInput> alloc_inputs;
        std::map<std::string, math::Matrix> selected_signals;
        for (const auto& cand : candidates) {
            if (!cand.eval.selected) continue;
            alloc_inputs.push_back({cand.eval.expression.id, cand.returns});
            selected_signals.emplace(cand.eval.expression.id,
                                     out_signals.at(cand.eval.expression.id));
        }
        const auto allocator = allocator::make_allocator(options.allocator_method);
        const Allocation allocation = allocator->allocate(alloc_inputs);

        // 7. Out-of-sample portfolio backtest with the learned weights.
        std::map<std::string, double> weight_map(allocation.weights.begin(), allocation.weights.end());
        const engine::BacktestOutput port =
            backtester.run_portfolio(selected_signals, weight_map, out_sample.forward_returns);

        BacktestResult result;
        result.metrics = port.metrics;
        result.dates = port.dates;
        result.equity_curve = port.equity_curve;
        result.allocation = allocation;
        result.allocation.expected_sharpe = port.metrics.sharpe;
        run.result = result;
        log.info("pipeline.portfolio", {field("oos_sharpe", port.metrics.sharpe),
                                        field("selected", static_cast<long>(selected_ids.size()))});
    } else {
        log.warn("pipeline.no_selection");
    }

    run.finished_at = now_iso8601();

    // 8. Persist + audit.
    runs_.save(run.run_id, to_json(run).dump(2));
    audit_.record(actor, "discovery.complete", run.run_id, Sensitivity::Internal, "ok",
                  std::to_string(run.n_selected) + " selected");
    log.info("pipeline.done", {field("run_id", run.run_id),
                               field("proposed", static_cast<long>(run.n_proposed)),
                               field("selected", static_cast<long>(run.n_selected))});
    return run;
}

}  // namespace alphaforge::app
