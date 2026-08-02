#include "alphaforge/proposer/AlphaProposer.hpp"

#include <filesystem>
#include <fstream>
#include <functional>
#include <sstream>

#include "alphaforge/dsl/AlphaLibrary.hpp"
#include "alphaforge/dsl/Expression.hpp"
#include "alphaforge/platform/Clock.hpp"
#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Json.hpp"
#include "alphaforge/platform/Logger.hpp"

#if defined(ALPHAFORGE_WITH_CURL)
#include <curl/curl.h>
#endif

namespace alphaforge::proposer {

namespace fs = std::filesystem;

namespace {
/// Short deterministic id derived from the expression text (audit reproducibility).
std::string alpha_id(const std::string& expression) {
    const std::size_t h = std::hash<std::string>{}(expression);
    char buf[11];
    std::snprintf(buf, sizeof(buf), "a%08x", static_cast<unsigned>(h & 0xFFFFFFFFu));
    return buf;
}

domain::AlphaExpression make_alpha(const std::string& expr, const std::string& rationale,
                                   const std::string& source) {
    domain::AlphaExpression a;
    a.id = alpha_id(expr);
    a.expression = expr;
    a.rationale = rationale;
    a.proposed_by = source;
    a.created_at = now_iso8601();
    return a;
}
}  // namespace

AlphaProposer::AlphaProposer(ProposerConfig config) : config_(std::move(config)) {
    std::error_code ec;
    fs::create_directories(config_.cache_dir, ec);
}

bool AlphaProposer::uses_llm() const {
#if defined(ALPHAFORGE_WITH_CURL)
    return !config_.offline && !config_.api_key.empty();
#else
    return false;
#endif
}

std::vector<domain::AlphaExpression> AlphaProposer::propose(
    int n, const std::vector<std::string>& avoid) const {
    if (uses_llm()) {
        try {
            auto alphas = from_llm(n, avoid);
            if (!alphas.empty()) return alphas;
            Logger::instance().warn("proposer.llm_empty_fallback");
        } catch (const std::exception& e) {
            Logger::instance().warn("proposer.llm_failed_fallback", {field("error", e.what())});
        }
    }
    return from_library(n, avoid);
}

std::vector<domain::AlphaExpression> AlphaProposer::from_library(
    int n, const std::vector<std::string>& avoid) const {
    const std::vector<std::string> avoid_set(avoid);
    auto is_avoided = [&](const std::string& e) {
        for (const auto& a : avoid_set) if (a == e) return true;
        return false;
    };

    std::vector<domain::AlphaExpression> out;
    for (const auto& lib : dsl::alpha_library()) {
        if (static_cast<int>(out.size()) >= n) break;
        if (is_avoided(lib.expression)) continue;
        out.push_back(make_alpha(lib.expression, lib.rationale, "template"));
    }
    Logger::instance().info("proposer.library", {field("n", static_cast<long>(out.size()))});
    return out;
}

// ---------------------------------------------------------------------------
// LLM path. The actual HTTP transport is only compiled when built WITH_CURL; otherwise
// uses_llm() is false and this function is never reached.
// ---------------------------------------------------------------------------
#if defined(ALPHAFORGE_WITH_CURL)
namespace {
std::size_t write_cb(char* ptr, std::size_t size, std::size_t nmemb, void* userdata) {
    auto* out = static_cast<std::string*>(userdata);
    out->append(ptr, size * nmemb);
    return size * nmemb;
}

std::string http_post(const std::string& url, const std::string& api_key, const std::string& body) {
    CURL* curl = curl_easy_init();
    if (!curl) throw ExternalServiceError("curl init failed");
    std::string response;
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "content-type: application/json");
    headers = curl_slist_append(headers, "anthropic-version: 2023-06-01");
    headers = curl_slist_append(headers, ("x-api-key: " + api_key).c_str());

    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L);

    const CURLcode rc = curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    if (rc != CURLE_OK) throw ExternalServiceError(std::string("curl error: ") + curl_easy_strerror(rc));
    return response;
}
}  // namespace
#endif

std::vector<domain::AlphaExpression> AlphaProposer::from_llm(
    int n, const std::vector<std::string>& avoid) const {
#if defined(ALPHAFORGE_WITH_CURL)
    // Build the prompt.
    std::ostringstream fields;
    for (const auto& f : dsl::dsl_fields()) fields << f << ' ';
    std::ostringstream funcs;
    for (const auto& f : dsl::function_names()) funcs << f << ' ';
    std::ostringstream examples;
    for (std::size_t i = 0; i < 6 && i < dsl::alpha_library().size(); ++i) {
        examples << "  " << dsl::alpha_library()[i].expression << "\n";
    }
    std::ostringstream avoid_block;
    for (const auto& a : avoid) avoid_block << a << "\n";

    const std::string system =
        "You are a quantitative researcher generating candidate cross-sectional equity alphas "
        "as formulas in a restricted DSL. Use ONLY the provided fields and functions. Return "
        "STRICT JSON: a list of objects with keys \"expression\" and \"rationale\". No prose "
        "outside the JSON. Each expression must be a single line and reference at least one field.";

    std::ostringstream user;
    user << "Fields: " << fields.str() << "\nFunctions: " << funcs.str()
         << "\nExamples:\n" << examples.str();
    if (!avoid.empty()) user << "Do NOT repeat:\n" << avoid_block.str();
    user << "\nPropose " << n << " NEW, diverse alphas as strict JSON.";

    // Cache lookup keyed by model + prompt.
    const std::string cache_key = alpha_id(config_.model + system + user.str());
    const fs::path cache_path = fs::path(config_.cache_dir) / (cache_key + ".json");
    std::string raw;
    if (fs::exists(cache_path)) {
        std::ifstream in(cache_path);
        raw.assign((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
        Logger::instance().info("proposer.cache_hit", {field("key", cache_key)});
    } else {
        Json req = Json::object();
        req.set("model", config_.model);
        req.set("max_tokens", 1500);
        req.set("system", system);
        Json messages = Json::array();
        Json msg = Json::object();
        msg.set("role", "user");
        msg.set("content", user.str());
        messages.push_back(msg);
        req.set("messages", messages);

        const std::string resp =
            http_post("https://api.anthropic.com/v1/messages", config_.api_key, req.dump());
        const Json parsed = Json::parse(resp);
        // Anthropic returns { content: [ { type:"text", text:"..." }, ... ] }
        std::string text;
        if (parsed.contains("content") && parsed["content"].is_array()) {
            for (const auto& block : parsed["content"].items()) {
                if (block["type"].as_string() == "text") text += block["text"].as_string();
            }
        }
        if (text.empty()) throw ExternalServiceError("LLM returned no text content");
        raw = text;
        std::ofstream out(cache_path, std::ios::trunc);
        out << raw;
    }

    // Strip a ```json fence if present.
    std::string json_text = raw;
    const auto fence = json_text.find('[');
    const auto fence_end = json_text.rfind(']');
    if (fence != std::string::npos && fence_end != std::string::npos && fence_end > fence) {
        json_text = json_text.substr(fence, fence_end - fence + 1);
    }

    const Json items = Json::parse(json_text);
    std::vector<domain::AlphaExpression> out;
    if (!items.is_array()) throw ExternalServiceError("LLM JSON is not an array");
    for (const auto& it : items.items()) {
        const std::string expr = it["expression"].as_string();
        if (expr.empty()) continue;
        try {
            dsl::validate(expr, dsl::dsl_fields());  // reject anything not in the DSL
        } catch (const DslError& e) {
            Logger::instance().info("proposer.rejected_invalid",
                                    {field("expression", expr), field("error", e.what())});
            continue;
        }
        out.push_back(make_alpha(expr, it["rationale"].as_string(), "llm"));
    }
    Logger::instance().info("proposer.llm_validated", {field("n", static_cast<long>(out.size()))});
    return out;
#else
    (void) n;
    (void) avoid;
    throw ExternalServiceError("Built without libcurl; LLM proposer unavailable");
#endif
}

}  // namespace alphaforge::proposer
