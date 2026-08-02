#include "alphaforge/platform/Config.hpp"

#include <cstdlib>
#include <sstream>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge {

namespace {
std::string get_env(const char* key, const std::string& fallback) {
    const char* v = std::getenv(key);
    return v ? std::string(v) : fallback;
}

bool get_env_bool(const char* key, bool fallback) {
    const char* v = std::getenv(key);
    if (!v) return fallback;
    const std::string s(v);
    return s == "1" || s == "true" || s == "TRUE" || s == "yes";
}

int get_env_int(const char* key, int fallback) {
    const char* v = std::getenv(key);
    if (!v) return fallback;
    try {
        return std::stoi(v);
    } catch (const std::exception&) {
        throw ConfigurationError(std::string("Invalid integer for ") + key);
    }
}

double get_env_double(const char* key, double fallback) {
    const char* v = std::getenv(key);
    if (!v) return fallback;
    try {
        return std::stod(v);
    } catch (const std::exception&) {
        throw ConfigurationError(std::string("Invalid number for ") + key);
    }
}

Environment parse_environment(const std::string& s) {
    if (s == "production") return Environment::Production;
    if (s == "testing") return Environment::Testing;
    if (s == "development") return Environment::Development;
    throw ConfigurationError("Unknown AF_ENVIRONMENT: " + s);
}

std::vector<std::string> split_csv(const std::string& s) {
    std::vector<std::string> out;
    std::stringstream ss(s);
    std::string item;
    while (std::getline(ss, item, ',')) {
        if (!item.empty()) out.push_back(item);
    }
    return out;
}
}  // namespace

const char* to_string(Environment env) noexcept {
    switch (env) {
        case Environment::Development: return "development";
        case Environment::Testing:     return "testing";
        case Environment::Production:  return "production";
    }
    return "development";
}

Config Config::from_environment() {
    Config c;
    c.environment = parse_environment(get_env("AF_ENVIRONMENT", "development"));
    c.log_level = get_env("AF_LOG_LEVEL", c.log_level);
    c.log_json = get_env_bool("AF_LOG_JSON", c.environment == Environment::Production);

    c.data_dir = get_env("AF_DATA_DIR", c.data_dir);
    c.region = get_env("AF_DATA_REGION", c.region);

    const std::string universe = get_env("AF_UNIVERSE", "");
    if (!universe.empty()) c.universe = split_csv(universe);
    c.start_date = get_env("AF_START_DATE", c.start_date);
    c.end_date = get_env("AF_END_DATE", c.end_date);
    c.in_sample_fraction = get_env_double("AF_IN_SAMPLE_FRACTION", c.in_sample_fraction);
    c.transaction_cost_bps = get_env_double("AF_TRANSACTION_COST_BPS", c.transaction_cost_bps);

    c.anthropic_api_key = get_env("AF_ANTHROPIC_API_KEY", "");
    c.llm_model = get_env("AF_LLM_MODEL", c.llm_model);
    c.llm_max_alphas_per_round = get_env_int("AF_LLM_MAX_ALPHAS_PER_ROUND", c.llm_max_alphas_per_round);
    c.llm_offline = get_env_bool("AF_LLM_OFFLINE", c.llm_offline);
    c.cache_dir = get_env("AF_CACHE_DIR", c.cache_dir);

    c.min_sharpe = get_env_double("AF_MIN_SHARPE", c.min_sharpe);
    c.max_pairwise_corr = get_env_double("AF_MAX_PAIRWISE_CORR", c.max_pairwise_corr);
    c.min_deflated_sharpe = get_env_double("AF_MIN_DEFLATED_SHARPE", c.min_deflated_sharpe);

    c.rate_limit_per_minute = get_env_int("AF_RATE_LIMIT_PER_MINUTE", c.rate_limit_per_minute);
    c.enable_second_ai_review = get_env_bool("AF_ENABLE_SECOND_AI_REVIEW", c.enable_second_ai_review);

    c.jwt_secret = get_env("AF_JWT_SECRET", c.jwt_secret);
    c.sso_enabled = get_env_bool("AF_SSO_ENABLED", c.sso_enabled);

    c.api_host = get_env("AF_API_HOST", c.api_host);
    c.api_port = get_env_int("AF_API_PORT", c.api_port);

    if (c.in_sample_fraction <= 0.0 || c.in_sample_fraction >= 1.0) {
        throw ConfigurationError("AF_IN_SAMPLE_FRACTION must be strictly between 0 and 1");
    }
    return c;
}

void Config::enforce_production_safety() const {
    if (!is_production()) return;
    std::vector<std::string> problems;
    if (jwt_secret == "dev-only-change-me") problems.emplace_back("AF_JWT_SECRET is still the dev default");
    if (anthropic_api_key.empty() && !llm_offline) {
        problems.emplace_back("AF_ANTHROPIC_API_KEY missing and AF_LLM_OFFLINE is false");
    }
    if (!sso_enabled) problems.emplace_back("AF_SSO_ENABLED is false in production");
    if (!problems.empty()) {
        std::string msg = "Production safety check failed:";
        for (const auto& p : problems) msg += " " + p + ";";
        throw ConfigurationError(msg);
    }
}

}  // namespace alphaforge
