#include "alphaforge/data/Crawler.hpp"

#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::data {

CrawlReport MarketDataCrawler::crawl(const std::vector<std::string>& symbols,
                                     const std::string& start, const std::string& end) {
    CrawlReport report;
    report.symbols_requested = static_cast<int>(symbols.size());
    auto& log = Logger::instance();
    log.info("crawler.start", {field("source", source_.name()),
                               field("symbols", static_cast<long>(symbols.size())),
                               field("start", start), field("end", end)});

    for (const auto& symbol : symbols) {
        try {
            // Fetch one symbol at a time so a single bad ticker cannot fail the batch.
            const std::vector<PriceBar> bars = source_.fetch({symbol}, start, end);
            const std::size_t written = repo_.save(bars);
            report.bars_written += written;
            ++report.symbols_ok;
            log.debug("crawler.symbol_ok", {field("symbol", symbol),
                                            field("bars", static_cast<long>(written))});
        } catch (const Error& e) {
            ++report.symbols_failed;
            report.failures.push_back(symbol + ": " + e.what());
            log.warn("crawler.symbol_failed",
                     {field("symbol", symbol), field("category", to_string(e.category())),
                      field("error", e.what())});
        } catch (const std::exception& e) {
            ++report.symbols_failed;
            report.failures.push_back(symbol + ": " + e.what());
            log.warn("crawler.symbol_failed", {field("symbol", symbol), field("error", e.what())});
        }
    }

    log.info("crawler.done", {field("ok", static_cast<long>(report.symbols_ok)),
                              field("failed", static_cast<long>(report.symbols_failed)),
                              field("bars", static_cast<long>(report.bars_written))});
    return report;
}

}  // namespace alphaforge::data
