#pragma once
///
/// \file Sentiment.hpp
/// \brief Finance-domain sentiment scoring and ticker extraction.
///
/// General-purpose sentiment lexicons misread financial text ("liability", "tax", "crude" are
/// neutral or technical here). This uses a Loughran-McDonald style finance lexicon, plus
/// negation handling, so "not profitable" does not score positive. The lexicon is hashed once
/// into a static table, so scoring a headline is a single pass over its tokens.
///
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "alphaforge/news/Feed.hpp"

namespace alphaforge::news {

class Sentiment {
public:
    /// Score a headline into [-1, 1]. Positive means bullish tone.
    [[nodiscard]] static double score(std::string_view text);

    /// The finance lexicon: term -> polarity weight.
    [[nodiscard]] static const std::unordered_map<std::string, double>& lexicon();
};

/// Matches company names and tickers inside headline text.
class TickerMatcher {
public:
    /// \param names symbol -> company name (e.g. "NVDA" -> "NVIDIA").
    explicit TickerMatcher(std::unordered_map<std::string, std::string> names);

    /// Symbols mentioned in `text`, matched on either the ticker or the company name.
    [[nodiscard]] std::vector<std::string> match(std::string_view text) const;

private:
    std::unordered_map<std::string, std::string> names_;   // symbol -> lowercase name key
    std::unordered_map<std::string, std::string> aliases_; // lowercase alias -> symbol
};

/// Aggregate per-ticker signals from a scored corpus.
[[nodiscard]] std::vector<TickerSignal> aggregate(const std::vector<NewsItem>& items);

}  // namespace alphaforge::news
