#include "alphaforge/news/Sentiment.hpp"

#include <algorithm>
#include <cctype>
#include <cmath>

namespace alphaforge::news {

namespace {

/// Words that invert the polarity of the next scored term.
const std::unordered_set<std::string>& negators() {
    static const std::unordered_set<std::string> set = {
        "not", "no", "never", "without", "fails", "failed", "fail", "lacks", "lacking",
        "avoid", "avoids", "unable", "cannot", "isnt", "wasnt", "wont", "doesnt", "didnt",
    };
    return set;
}

/// Lowercase alphanumeric tokens.
std::vector<std::string> tokenize(std::string_view text) {
    std::vector<std::string> out;
    out.reserve(24);
    std::string cur;
    for (char c : text) {
        if (std::isalnum(static_cast<unsigned char>(c))) {
            cur += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        } else if (!cur.empty()) {
            out.push_back(std::move(cur));
            cur.clear();
        }
    }
    if (!cur.empty()) out.push_back(std::move(cur));
    return out;
}

}  // namespace

const std::unordered_map<std::string, double>& Sentiment::lexicon() {
    static const std::unordered_map<std::string, double> lex = {
        // Strong positive
        {"surge", 1.0}, {"surges", 1.0}, {"surged", 1.0}, {"soar", 1.0}, {"soars", 1.0},
        {"soared", 1.0}, {"skyrocket", 1.0}, {"skyrockets", 1.0}, {"record", 0.8},
        {"breakthrough", 0.9}, {"outperform", 0.8}, {"outperforms", 0.8}, {"outperforming", 0.8},
        {"beat", 0.7}, {"beats", 0.7}, {"upgrade", 0.8}, {"upgraded", 0.8}, {"upgrades", 0.8},
        {"rally", 0.7}, {"rallies", 0.7}, {"rallied", 0.7}, {"bullish", 0.9},
        // Moderate positive
        {"gain", 0.5}, {"gains", 0.5}, {"gained", 0.5}, {"rise", 0.45}, {"rises", 0.45},
        {"rose", 0.45}, {"jump", 0.6}, {"jumps", 0.6}, {"jumped", 0.6}, {"climb", 0.5},
        {"climbs", 0.5}, {"growth", 0.5}, {"profit", 0.5}, {"profits", 0.5}, {"profitable", 0.6},
        {"strong", 0.5}, {"stronger", 0.55}, {"boost", 0.5}, {"boosts", 0.5}, {"boosted", 0.5},
        {"expand", 0.4}, {"expands", 0.4}, {"expansion", 0.4}, {"approve", 0.5}, {"approved", 0.5},
        {"win", 0.5}, {"wins", 0.5}, {"won", 0.5}, {"optimism", 0.6}, {"optimistic", 0.6},
        {"opportunity", 0.4}, {"innovation", 0.4}, {"momentum", 0.4}, {"raises", 0.4},
        {"top", 0.3}, {"tops", 0.5},
        // Strong negative
        {"plunge", -1.0}, {"plunges", -1.0}, {"plunged", -1.0}, {"crash", -1.0}, {"crashes", -1.0},
        {"collapse", -1.0}, {"collapses", -1.0}, {"collapsed", -1.0}, {"bankruptcy", -1.0},
        {"bankrupt", -1.0}, {"fraud", -1.0}, {"probe", -0.7}, {"lawsuit", -0.7},
        {"investigation", -0.7}, {"downgrade", -0.8}, {"downgraded", -0.8}, {"downgrades", -0.8},
        {"bearish", -0.9}, {"recession", -0.9}, {"default", -0.9}, {"selloff", -0.8},
        // Moderate negative
        {"fall", -0.5}, {"falls", -0.5}, {"fell", -0.5}, {"drop", -0.5}, {"drops", -0.5},
        {"dropped", -0.5}, {"decline", -0.5}, {"declines", -0.5}, {"declined", -0.5},
        {"slump", -0.7}, {"slumps", -0.7}, {"slumped", -0.7}, {"slide", -0.5}, {"slides", -0.5},
        {"loss", -0.6}, {"losses", -0.6}, {"weak", -0.5}, {"weaker", -0.55}, {"weakness", -0.55},
        {"miss", -0.6}, {"misses", -0.6}, {"missed", -0.6}, {"cut", -0.4}, {"cuts", -0.4},
        {"layoff", -0.7}, {"layoffs", -0.7}, {"risk", -0.3}, {"risks", -0.3}, {"warning", -0.6},
        {"warns", -0.6}, {"warned", -0.6}, {"concern", -0.4}, {"concerns", -0.4},
        {"struggle", -0.6}, {"struggles", -0.6}, {"struggling", -0.6}, {"pressure", -0.4},
        {"delay", -0.4}, {"delays", -0.4}, {"delayed", -0.4}, {"halt", -0.6}, {"halts", -0.6},
        {"tariff", -0.4}, {"tariffs", -0.4}, {"volatile", -0.3}, {"volatility", -0.3},
        {"slowdown", -0.6}, {"shrink", -0.5}, {"shrinks", -0.5}, {"down", -0.35},
    };
    return lex;
}

double Sentiment::score(std::string_view text) {
    const auto tokens = tokenize(text);
    if (tokens.empty()) return 0.0;

    const auto& lex = lexicon();
    double total = 0.0;
    int hits = 0;
    bool negate = false;

    for (const auto& tok : tokens) {
        if (negators().count(tok)) { negate = true; continue; }
        const auto it = lex.find(tok);
        if (it != lex.end()) {
            total += negate ? -it->second : it->second;
            ++hits;
            negate = false;
        } else if (hits > 0) {
            // A negation only reaches the next few words.
            negate = false;
        }
    }
    if (hits == 0) return 0.0;
    // Mean polarity, damped by how much of the headline actually carried signal.
    const double mean = total / hits;
    const double coverage = std::min(1.0, static_cast<double>(hits) / 3.0);
    return std::clamp(mean * (0.55 + 0.45 * coverage), -1.0, 1.0);
}

// --- TickerMatcher ---------------------------------------------------------
TickerMatcher::TickerMatcher(std::unordered_map<std::string, std::string> names)
    : names_(std::move(names)) {
    for (const auto& [symbol, name] : names_) {
        std::string key;
        for (char c : name) key += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        // Index the first significant word ("NVIDIA Corp" -> "nvidia").
        const std::size_t space = key.find(' ');
        const std::string head = space == std::string::npos ? key : key.substr(0, space);
        if (head.size() >= 3) aliases_[head] = symbol;
        aliases_[key] = symbol;
    }
}

std::vector<std::string> TickerMatcher::match(std::string_view text) const {
    std::vector<std::string> found;
    const auto tokens = tokenize(text);

    for (const auto& tok : tokens) {
        // Company-name alias.
        const auto alias = aliases_.find(tok);
        if (alias != aliases_.end()) {
            if (std::find(found.begin(), found.end(), alias->second) == found.end())
                found.push_back(alias->second);
            continue;
        }
        // Bare ticker, matched case-insensitively against the symbol table.
        std::string upper;
        for (char c : tok) upper += static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
        if (upper.size() >= 2 && names_.count(upper)) {
            if (std::find(found.begin(), found.end(), upper) == found.end()) found.push_back(upper);
        }
    }
    return found;
}

// --- aggregation -----------------------------------------------------------
std::vector<TickerSignal> aggregate(const std::vector<NewsItem>& items) {
    std::unordered_map<std::string, TickerSignal> acc;
    for (const auto& item : items) {
        for (const auto& sym : item.tickers) {
            auto& sig = acc[sym];
            sig.symbol = sym;
            sig.mentions += 1;
            sig.sentiment += item.sentiment;
            sig.latest_at = std::max(sig.latest_at, item.published_at);
        }
    }

    std::vector<TickerSignal> out;
    out.reserve(acc.size());
    double total_mentions = 0;
    for (auto& [sym, sig] : acc) {
        if (sig.mentions > 0) sig.sentiment /= sig.mentions;
        total_mentions += sig.mentions;
        out.push_back(sig);
    }
    const double avg = out.empty() ? 1.0 : total_mentions / static_cast<double>(out.size());
    for (auto& sig : out) sig.buzz = avg > 0 ? sig.mentions / avg : 0.0;

    std::sort(out.begin(), out.end(), [](const TickerSignal& a, const TickerSignal& b) {
        return a.mentions > b.mentions;
    });
    return out;
}

}  // namespace alphaforge::news
