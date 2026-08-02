#pragma once
///
/// \file NewsCrawler.hpp
/// \brief Concurrent multi-feed news crawler.
///
/// Feeds are fetched in parallel across a bounded thread pool, so total latency is the slowest
/// single feed rather than the sum of all of them. Parsing and scoring then run over the merged
/// corpus. Every phase is timed and reported in CrawlStats.
///
/// Politeness and licensing: only publicly syndicated RSS/Atom endpoints are polled, one request
/// per feed per cycle, with a descriptive User-Agent and a response cache. Commercial terminal
/// feeds are never accessed.
///
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "alphaforge/news/Feed.hpp"
#include "alphaforge/news/Sentiment.hpp"

namespace alphaforge::news {

/// Fetches a URL and returns the body. Injected so the crawler is testable offline.
using Fetcher = std::function<std::string(const std::string& url)>;

struct CrawlResult {
    std::vector<NewsItem> items;
    std::vector<TickerSignal> signals;
    CrawlStats stats;
};

class NewsCrawler {
public:
    /// \param names   symbol -> company name, used to tag headlines with tickers.
    /// \param fetcher HTTP transport; defaults to libcurl when built WITH_CURL.
    /// \param threads worker count; 0 selects hardware concurrency (capped at 16).
    NewsCrawler(std::unordered_map<std::string, std::string> names,
                Fetcher fetcher = {},
                unsigned threads = 0);

    /// Crawl every source, parse, de-duplicate, score, and aggregate.
    [[nodiscard]] CrawlResult crawl(const std::vector<FeedSource>& sources) const;

private:
    TickerMatcher matcher_;
    Fetcher fetcher_;
    unsigned threads_;
};

/// Default libcurl-backed fetcher (throws ExternalServiceError when built without curl).
[[nodiscard]] Fetcher make_http_fetcher(int timeout_seconds = 10);

}  // namespace alphaforge::news
