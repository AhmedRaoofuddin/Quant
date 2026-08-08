#include "alphaforge/app/Pipeline.hpp"

#include <cstdint>

#include "alphaforge/data/Repository.hpp"
#include "alphaforge/data/SyntheticDataSource.hpp"
#include "alphaforge/guardrails/AuditLog.hpp"
#include "alphaforge/platform/Config.hpp"
#include "framework.hpp"

using namespace alphaforge;

AF_TEST(pipeline_runs_end_to_end_offline) {
    Config config;
    config.environment = Environment::Testing;
    config.data_dir = "test_tmp_data";
    config.cache_dir = "test_tmp_data/cache";
    config.llm_offline = true;
    config.universe = {"AAA", "BBB", "CCC", "DDD", "EEE"};
    config.start_date = "2018-01-01";
    config.end_date = "2020-12-31";

    data::SyntheticDataSource source(7);
    data::FileRunRepository runs(config.data_dir);
    guardrails::AuditLog audit(config.data_dir);

    app::Pipeline pipeline(config, source, runs, audit);
    app::PipelineOptions options;
    options.n_alphas = 8;

    const domain::DiscoveryRun run =
        pipeline.run(config.universe, config.start_date, config.end_date, "test", options);

    CHECK(!run.run_id.empty());
    CHECK(run.n_proposed > 0);
    CHECK(run.alphas.size() == static_cast<std::size_t>(run.n_proposed));
    CHECK(run.n_selected >= 0);
    CHECK(run.n_selected <= run.n_proposed);

    // The run must be retrievable from the repository (persistence works).
    const auto payload = runs.load(run.run_id);
    CHECK(payload.has_value());
    CHECK(payload->find(run.run_id) != std::string::npos);

    // Every proposed alpha carries an in-sample scorecard.
    for (const auto& a : run.alphas) {
        CHECK(a.in_sample.n_obs > 0);
        CHECK(a.out_sample.has_value());
    }
}

AF_TEST(pipeline_is_deterministic_offline) {
    Config config;
    config.data_dir = "test_tmp_data2";
    config.llm_offline = true;
    config.universe = {"AAA", "BBB", "CCC", "DDD"};
    config.start_date = "2019-01-01";
    config.end_date = "2020-12-31";

    auto run_once = [&](int seed) {
        data::SyntheticDataSource source(static_cast<std::uint64_t>(seed));
        data::FileRunRepository runs(config.data_dir);
        guardrails::AuditLog audit(config.data_dir);
        app::Pipeline pipeline(config, source, runs, audit);
        return pipeline.run(config.universe, config.start_date, config.end_date, "test");
    };

    const auto a = run_once(11);
    const auto b = run_once(11);
    // Same seed -> same number of proposed and selected alphas.
    CHECK(a.n_proposed == b.n_proposed);
    CHECK(a.n_selected == b.n_selected);
}
