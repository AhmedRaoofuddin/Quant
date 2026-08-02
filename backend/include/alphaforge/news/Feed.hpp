#pragma once
///
/// \file Feed.hpp
/// \brief News domain types.
///
/// Alpha-Forge ingests only publicly syndicated feeds (RSS/Atom), which publishers provide
/// expressly for redistribution. It does not scrape paywalled or terms-restricted sites;
/// commercial terminals (Bloomberg Terminal, Reuters Eikon) are licensed products and are not
/// used. Headlines from those wires reach us only where a publisher or aggregator syndicates
/// them publicly, and we always retain and display the original source attribution.
///
#include <cstdint>
#include <string>
#include <vector>

namespace alphaforge::news {

/// A syndicated feed we are permitted to poll.
struct FeedSource {
    std::string id;        ///< short key, e.g. "cnbc-markets"
    std::string publisher; ///< display name, e.g. "CNBC"
    std::string url;       ///< RSS/Atom endpoint
    int weight = 1;        ///< credibility weight applied to the aggregate signal
};

/// One published headline.
struct NewsItem {
    std::string title;
    std::string link;
    std::string publisher;
    std::string source_id;
    std::int64_t published_at = 0;  ///< unix seconds; 0 when the feed omits a date
    double sentiment = 0.0;         ///< [-1, 1] from the finance lexicon
    std::vector<std::string> tickers;  ///< symbols matched in the headline
};

/// Per-ticker aggregate derived from the crawled corpus.
struct TickerSignal {
    std::string symbol;
    int mentions = 0;
    double sentiment = 0.0;   ///< weighted mean in [-1, 1]
    double buzz = 0.0;        ///< mentions relative to the corpus average
    std::int64_t latest_at = 0;
};

/// Timing and volume telemetry for one crawl (the latency story).
struct CrawlStats {
    int feeds_attempted = 0;
    int feeds_ok = 0;
    int items_parsed = 0;
    int items_deduped = 0;
    double fetch_ms = 0.0;    ///< wall-clock for the concurrent fetch phase
    double parse_ms = 0.0;    ///< total parse time
    double score_ms = 0.0;    ///< total sentiment scoring time
    double total_ms = 0.0;
    double items_per_sec = 0.0;
};

/// The default source set: publicly syndicated finance feeds.
[[nodiscard]] const std::vector<FeedSource>& default_sources();

}  // namespace alphaforge::news
