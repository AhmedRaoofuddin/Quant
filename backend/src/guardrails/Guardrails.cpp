#include "alphaforge/guardrails/Guardrails.hpp"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <regex>

#include "alphaforge/dsl/Expression.hpp"
#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::guardrails {

namespace {
std::string to_lower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return s;
}

long long epoch_seconds() {
    return std::chrono::duration_cast<std::chrono::seconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}
}  // namespace

void InputGuard::check_alpha(const std::string& expression) const {
    try {
        dsl::validate(expression, allowed_fields_);  // throws DslError on anything illegal
    } catch (const DslError& e) {
        throw GuardrailError(std::string("Rejected alpha expression: ") + e.what());
    }
}

std::string InputGuard::redact_pii(const std::string& text) const {
    static const std::regex email(R"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})");
    static const std::regex long_digits(R"(\b\d{6,}\b)");  // ids, card/account-like runs
    std::string out = std::regex_replace(text, email, "[REDACTED_EMAIL]");
    out = std::regex_replace(out, long_digits, "[REDACTED_NUMBER]");
    return out;
}

void InputGuard::check_prompt(const std::string& text) const {
    static const std::vector<std::string> banned = {
        "ignore previous instructions", "ignore all previous", "disregard the system",
        "you are now", "reveal your system prompt", "developer mode", "jailbreak"};
    const std::string lower = to_lower(text);
    for (const auto& phrase : banned) {
        if (lower.find(phrase) != std::string::npos) {
            Logger::instance().warn("guardrail.prompt_blocked", {field("phrase", phrase)});
            throw GuardrailError("Prompt rejected: possible injection/jailbreak attempt");
        }
    }
}

bool OutputGuard::is_valid_alpha(const std::string& expression) const {
    try {
        dsl::validate(expression, allowed_fields_);
        return true;
    } catch (const DslError&) {
        return false;
    }
}

bool RateLimiter::allow(const std::string& actor) {
    const long long now = epoch_seconds();
    std::lock_guard<std::mutex> lock(mutex_);
    auto& window = hits_[actor];
    while (!window.empty() && now - window.front() >= 60) window.pop_front();
    if (static_cast<int>(window.size()) >= max_per_minute_) {
        Logger::instance().warn("guardrail.rate_limited", {field("actor", actor)});
        return false;
    }
    window.push_back(now);
    return true;
}

}  // namespace alphaforge::guardrails
