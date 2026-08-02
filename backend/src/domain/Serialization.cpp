#include "alphaforge/domain/Serialization.hpp"

namespace alphaforge::domain {

Json to_json(const AlphaExpression& a) {
    Json j = Json::object();
    j.set("id", a.id);
    j.set("expression", a.expression);
    j.set("rationale", a.rationale);
    j.set("proposed_by", a.proposed_by);
    j.set("created_at", a.created_at);
    return j;
}

Json to_json(const AlphaMetrics& m) {
    Json j = Json::object();
    j.set("alpha_id", m.alpha_id);
    j.set("sharpe", m.sharpe);
    j.set("ann_return", m.ann_return);
    j.set("ann_vol", m.ann_vol);
    j.set("max_drawdown", m.max_drawdown);
    j.set("turnover", m.turnover);
    j.set("ic_mean", m.ic_mean);
    j.set("ic_ir", m.ic_ir);
    j.set("n_obs", static_cast<long>(m.n_obs));
    j.set("deflated_sharpe", m.deflated_sharpe);
    return j;
}

Json to_json(const EvaluatedAlpha& e) {
    Json j = Json::object();
    j.set("expression", to_json(e.expression));
    j.set("in_sample", to_json(e.in_sample));
    if (e.out_sample) j.set("out_sample", to_json(*e.out_sample));
    else j.set("out_sample", Json(nullptr));
    j.set("selected", e.selected);
    j.set("reject_reason", e.reject_reason);
    j.set("risk_score", e.risk_score);
    return j;
}

Json to_json(const Allocation& a) {
    Json j = Json::object();
    Json weights = Json::object();
    for (const auto& [id, w] : a.weights) weights.set(id, w);
    j.set("weights", weights);
    j.set("method", a.method);
    j.set("expected_sharpe", a.expected_sharpe);
    return j;
}

Json to_json(const BacktestResult& r) {
    Json j = Json::object();
    j.set("metrics", to_json(r.metrics));
    Json dates = Json::array();
    for (const auto& d : r.dates) dates.push_back(d);
    j.set("dates", dates);
    Json curve = Json::array();
    for (double v : r.equity_curve) curve.push_back(v);
    j.set("equity_curve", curve);
    j.set("allocation", to_json(r.allocation));
    return j;
}

Json to_json(const DiscoveryRun& run) {
    Json j = Json::object();
    j.set("run_id", run.run_id);
    Json uni = Json::array();
    for (const auto& s : run.universe) uni.push_back(s);
    j.set("universe", uni);
    j.set("start_date", run.start_date);
    j.set("end_date", run.end_date);
    j.set("n_proposed", static_cast<long>(run.n_proposed));
    j.set("n_selected", static_cast<long>(run.n_selected));
    Json alphas = Json::array();
    for (const auto& a : run.alphas) alphas.push_back(to_json(a));
    j.set("alphas", alphas);
    if (run.result) j.set("result", to_json(*run.result));
    else j.set("result", Json(nullptr));
    j.set("region", run.region);
    j.set("started_at", run.started_at);
    j.set("finished_at", run.finished_at);
    return j;
}

Json to_json(const AuditEvent& e) {
    Json j = Json::object();
    j.set("timestamp", e.timestamp);
    j.set("actor", e.actor);
    j.set("action", e.action);
    j.set("resource", e.resource);
    j.set("sensitivity", std::string(to_string(e.sensitivity)));
    j.set("outcome", e.outcome);
    j.set("detail", e.detail);
    return j;
}

AlphaExpression alpha_from_json(const Json& j) {
    AlphaExpression a;
    a.id = j["id"].as_string();
    a.expression = j["expression"].as_string();
    a.rationale = j["rationale"].as_string();
    a.proposed_by = j["proposed_by"].as_string("llm");
    a.created_at = j["created_at"].as_string();
    return a;
}

}  // namespace alphaforge::domain
