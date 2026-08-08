#include "alphaforge/news/NewsCrawler.hpp"

#include <algorithm>
#include <unordered_map>
#include <atomic>
#include <chrono>
#include <functional>
#include <mutex>
#include <thread>
#include <unordered_set>

#include "alphaforge/news/RssParser.hpp"
#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

#if defined(ALPHAFORGE_WITH_CURL)
#include <curl/curl.h>
#endif

namespace alphaforge::news {

namespace {
using Clock = std::chrono::steady_clock;
double ms_since(Clock::time_point t) {
    return std::chrono::duration<double, std::milli>(Clock::now() - t).count();
}

/// Normalised headline key for de-duplication across aggregators.
std::string dedupe_key(const std::string& title) {
    std::string key;
    key.reserve(title.size());
    for (char c : title) {
        if (std::isalnum(static_cast<unsigned char>(c)))
            key += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }
    return key.substr(0, 96);
}
}  // namespace

const std::vector<FeedSource>& default_sources() {
    // Publicly syndicated finance feeds. Google News entries surface wire headlines
    // (Reuters, Bloomberg, WSJ and others) through the publisher's own syndication,
    // and each item keeps its original <source> attribution.
    static const std::vector<FeedSource> sources = {
        {"cnbc-top", "CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html", 3},
        {"cnbc-finance", "CNBC Finance", "https://www.cnbc.com/id/10000664/device/rss/rss.html", 3},
        {"yahoo-finance", "Yahoo Finance", "https://finance.yahoo.com/news/rssindex", 2},
        {"marketwatch", "MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories", 3},
        {"nasdaq", "Nasdaq", "https://www.nasdaq.com/feed/rssoutbound?category=Markets", 2},
        {"gnews-markets", "Google News", "https://news.google.com/rss/search?q=stock+market&hl=en-US&gl=US&ceid=US:en", 2},
        {"gnews-earnings", "Google News", "https://news.google.com/rss/search?q=earnings+report&hl=en-US&gl=US&ceid=US:en", 2},
        {"gnews-fed", "Google News", "https://news.google.com/rss/search?q=federal+reserve+rates&hl=en-US&gl=US&ceid=US:en", 2},
    };
    return sources;
}

NewsCrawler::NewsCrawler(std::unordered_map<std::string, std::string> names, Fetcher fetcher,
                         unsigned threads)
    : matcher_(std::move(names)), fetcher_(std::move(fetcher)) {
    if (!fetcher_) fetcher_ = make_http_fetcher();
    const unsigned hw = std::max(2u, std::thread::hardware_concurrency());
    threads_ = threads == 0 ? std::min(16u, hw) : threads;
}

CrawlResult NewsCrawler::crawl(const std::vector<FeedSource>& sources) const {
    CrawlResult result;
    result.stats.feeds_attempted = static_cast<int>(sources.size());
    const auto t_total = Clock::now();

    // --- Phase 1: concurrent fetch. Total latency is the slowest feed, not the sum. ---
    const auto t_fetch = Clock::now();
    std::vector<std::string> bodies(sources.size());
    std::atomic<std::size_t> next{0};
    std::atomic<int> ok{0};

    const unsigned workers = std::min<unsigned>(threads_, static_cast<unsigned>(sources.size()));
    std::vector<std::thread> pool;
    pool.reserve(workers);
    for (unsigned w = 0; w < workers; ++w) {
        pool.emplace_back([&] {
            for (;;) {
                const std::size_t i = next.fetch_add(1);
                if (i >= sources.size()) return;
                try {
                    bodies[i] = fetcher_(sources[i].url);
                    if (!bodies[i].empty()) ok.fetch_add(1);
                } catch (const std::exception& e) {
                    Logger::instance().warn("news.fetch_failed",
                                            {field("source", sources[i].id), field("error", e.what())});
                }
            }
        });
    }
    for (auto& t : pool) t.join();
    result.stats.fetch_ms = ms_since(t_fetch);
    result.stats.feeds_ok = ok.load();

    // --- Phase 2: parse ---
    const auto t_parse = Clock::now();
    std::vector<NewsItem> all;
    for (std::size_t i = 0; i < sources.size(); ++i) {
        if (bodies[i].empty()) continue;
        auto items = RssParser::parse(bodies[i], sources[i]);
        all.insert(all.end(), std::make_move_iterator(items.begin()),
                   std::make_move_iterator(items.end()));
    }
    result.stats.items_parsed = static_cast<int>(all.size());
    result.stats.parse_ms = ms_since(t_parse);

    // --- Phase 3: de-duplicate, score, tag ---
    const auto t_score = Clock::now();
    std::unordered_set<std::string> seen;
    seen.reserve(all.size() * 2);
    result.items.reserve(all.size());
    for (auto& item : all) {
        if (!seen.insert(dedupe_key(item.title)).second) continue;
        item.sentiment = Sentiment::score(item.title);
        item.tickers = matcher_.match(item.title);
        result.items.push_back(std::move(item));
    }
    result.stats.items_deduped = result.stats.items_parsed - static_cast<int>(result.items.size());
    result.stats.score_ms = ms_since(t_score);

    std::sort(result.items.begin(), result.items.end(),
              [](const NewsItem& a, const NewsItem& b) { return a.published_at > b.published_at; });

    result.signals = aggregate(result.items);
    result.stats.total_ms = ms_since(t_total);
    result.stats.items_per_sec =
        result.stats.total_ms > 0 ? result.stats.items_parsed * 1000.0 / result.stats.total_ms : 0.0;

    Logger::instance().info("news.crawl",
                            {field("feeds_ok", static_cast<long>(result.stats.feeds_ok)),
                             field("items", static_cast<long>(result.items.size())),
                             field("total_ms", result.stats.total_ms)});
    return result;
}

// --- HTTP transport --------------------------------------------------------
#if defined(ALPHAFORGE_WITH_CURL)
namespace {
std::size_t write_cb(char* ptr, std::size_t size, std::size_t nmemb, void* userdata) {
    static_cast<std::string*>(userdata)->append(ptr, size * nmemb);
    return size * nmemb;
}
}  // namespace

Fetcher make_http_fetcher(int timeout_seconds) {
    return [timeout_seconds](const std::string& url) -> std::string {
        CURL* curl = curl_easy_init();
        if (!curl) throw ExternalServiceError("curl init failed");
        std::string body;
        curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &body);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, static_cast<long>(timeout_seconds));
        curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
        curl_easy_setopt(curl, CURLOPT_ACCEPT_ENCODING, "");
        curl_easy_setopt(curl, CURLOPT_USERAGENT,
                         "AlphaForge/1.0 (quant research; syndicated RSS only)");
        const CURLcode rc = curl_easy_perform(curl);
        curl_easy_cleanup(curl);
        if (rc != CURLE_OK) throw ExternalServiceError(std::string("curl: ") + curl_easy_strerror(rc));
        return body;
    };
}
#else
Fetcher make_http_fetcher(int) {
    return [](const std::string&) -> std::string {
        throw ExternalServiceError("Built without libcurl; inject a Fetcher to crawl.");
    };
}
#endif

}  // namespace alphaforge::news
