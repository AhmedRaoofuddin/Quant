#pragma once
///
/// \file Config.hpp
/// \brief Runtime configuration for the three deployment environments (Phase 2 / Phase 6).
///
/// All values load from environment variables prefixed AF_ (12-factor). Secrets never live in
/// code; production injects them from the Ministry vault. `enforce_production_safety()` fails
/// fast if a production process still holds development defaults.
///
#include <string>
#include <vector>

namespace alphaforge {

enum class Environment { Development, Testing, Production };

struct Config {
    // --- environment -------------------------------------------------------
    Environment environment = Environment::Development;
    std::string log_level = "info";
    bool log_json = false;

    // --- data layer --------------------------------------------------------
    std::string data_dir = "data";
    std::string region = "uae-north";  ///< residency tag stamped on every artifact.

    // --- universe / backtest ----------------------------------------------
    std::vector<std::string> universe = {
        "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
        "JPM", "V", "JNJ", "WMT", "PG", "XOM", "HD", "BAC"};
    std::string start_date = "2015-01-01";
    std::string end_date = "2024-12-31";
    double in_sample_fraction = 0.6;
    double transaction_cost_bps = 5.0;

    // --- LLM proposer ------------------------------------------------------
    std::string anthropic_api_key;      ///< empty -> offline template proposer.
    std::string llm_model = "claude-opus-5";
    int llm_max_alphas_per_round = 8;
    bool llm_offline = false;
    std::string cache_dir = "data/cache";

    // --- selection ---------------------------------------------------------
    double min_sharpe = 0.5;
    double max_pairwise_corr = 0.7;
    double min_deflated_sharpe = 0.90;

    // --- guardrails --------------------------------------------------------
    int rate_limit_per_minute = 30;
    bool enable_second_ai_review = true;

    // --- auth --------------------------------------------------------------
    std::string jwt_secret = "dev-only-change-me";
    bool sso_enabled = false;

    // --- api ---------------------------------------------------------------
    std::string api_host = "0.0.0.0";
    int api_port = 8000;

    [[nodiscard]] bool is_production() const noexcept { return environment == Environment::Production; }

    /// Load configuration from the process environment.
    [[nodiscard]] static Config from_environment();

    /// Throw ConfigurationError if a production deployment still holds insecure defaults.
    void enforce_production_safety() const;
};

[[nodiscard]] const char* to_string(Environment env) noexcept;

}  // namespace alphaforge
