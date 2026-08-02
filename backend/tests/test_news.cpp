#include <unordered_map>

#include "alphaforge/news/NewsCrawler.hpp"
#include "alphaforge/news/RssParser.hpp"
#include "alphaforge/news/Sentiment.hpp"
#include "framework.hpp"

using namespace alphaforge::news;

namespace {
const char* kRss = R"(<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Nvidia Stock Surges After Record Earnings Beat</title>
<link>https://example.com/a</link><pubDate>Mon, 27 Jul 2026 20:21:00 GMT</pubDate>
<source url="https://wsj.com">WSJ</source></item>
<item><title><![CDATA[Boeing Plunges on Fresh Probe &amp; Delays]]></title>
<link>https://example.com/b</link><pubDate>Tue, 28 Jul 2026 08:00:00 GMT</pubDate></item>
</channel></rss>)";

FeedSource src() { return {"test", "TestWire", "https://example.com/rss", 1}; }
}  // namespace

AF_TEST(rss_parses_items_and_fields) {
    const auto items = RssParser::parse(kRss, src());
    CHECK(items.size() == 2);
    CHECK(items[0].title == "Nvidia Stock Surges After Record Earnings Beat");
    CHECK(items[0].link == "https://example.com/a");
    CHECK(items[0].publisher == "WSJ");           // <source> overrides the feed name
    CHECK(items[0].published_at > 1700000000);    // parsed RFC-822 date
}

AF_TEST(rss_decodes_cdata_and_entities) {
    const auto items = RssParser::parse(kRss, src());
    CHECK(items[1].title == "Boeing Plunges on Fresh Probe & Delays");
}

AF_TEST(rss_handles_atom) {
    const char* atom = R"(<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Fed Holds Rates Steady</title><link href="https://example.com/x"/>
<updated>2026-08-02T11:22:33Z</updated></entry></feed>)";
    const auto items = RssParser::parse(atom, src());
    CHECK(items.size() == 1);
    CHECK(items[0].link == "https://example.com/x");
    CHECK(items[0].published_at > 1700000000);
}

AF_TEST(sentiment_reads_direction) {
    CHECK(Sentiment::score("Stock surges to record high on strong profit") > 0.3);
    CHECK(Sentiment::score("Shares plunge after bankruptcy probe and losses") < -0.3);
    CHECK_NEAR(Sentiment::score("Company announces annual meeting date"), 0.0, 1e-9);
}

AF_TEST(sentiment_handles_negation) {
    const double plain = Sentiment::score("profitable quarter");
    const double negated = Sentiment::score("not profitable quarter");
    CHECK(plain > 0);
    CHECK(negated < 0);
}

AF_TEST(ticker_matcher_finds_name_and_symbol) {
    TickerMatcher m({{"NVDA", "NVIDIA"}, {"BA", "Boeing"}});
    const auto a = m.match("Nvidia Stock Surges After Record Earnings");
    CHECK(a.size() == 1);
    CHECK(a[0] == "NVDA");
    const auto b = m.match("Analysts cut BA price target");
    CHECK(b.size() == 1);
    CHECK(b[0] == "BA");
}

AF_TEST(crawler_dedupes_and_aggregates_offline) {
    // Two sources serving the same story: the duplicate must collapse.
    auto fake = [](const std::string&) { return std::string(kRss); };
    NewsCrawler crawler({{"NVDA", "NVIDIA"}, {"BA", "Boeing"}}, fake, 4);
    const std::vector<FeedSource> two = {
        {"a", "A", "https://a/rss", 1}, {"b", "B", "https://b/rss", 1}};

    const CrawlResult r = crawler.crawl(two);
    CHECK(r.stats.feeds_ok == 2);
    CHECK(r.stats.items_parsed == 4);
    CHECK(r.items.size() == 2);        // deduplicated by headline
    CHECK(r.stats.items_deduped == 2);
    CHECK(r.stats.total_ms >= 0.0);

    // NVDA headline is positive, BA headline is negative.
    bool sawNvda = false, sawBa = false;
    for (const auto& s : r.signals) {
        if (s.symbol == "NVDA") { sawNvda = true; CHECK(s.sentiment > 0); }
        if (s.symbol == "BA") { sawBa = true; CHECK(s.sentiment < 0); }
    }
    CHECK(sawNvda);
    CHECK(sawBa);
}
