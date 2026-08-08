#pragma once
///
/// \file Crawler.hpp
/// \brief Market-data crawler: pulls bars from a data source into the repository.
///
/// Fault-tolerant by design (Phase 2: "Auto-retry and safe backup if a step fails"): a failure
/// on one symbol is logged and skipped, never aborting the whole crawl. Produces a structured
/// report for the audit trail.
///
#include <string>
#include <vector>

#include "alphaforge/data/DataSource.hpp"
#include "alphaforge/data/Repository.hpp"

namespace alphaforge::data {

struct CrawlReport {
    int symbols_requested = 0;
    int symbols_ok = 0;
    int symbols_failed = 0;
    std::size_t bars_written = 0;
    std::vector<std::string> failures;  ///< "SYMBOL: reason"
};

class MarketDataCrawler {
public:
    MarketDataCrawler(IDataSource& source, IPriceRepository& repo) : source_(source), repo_(repo) {}

    /// Crawl each symbol independently; batches persisted per symbol.
    [[nodiscard]] CrawlReport crawl(const std::vector<std::string>& symbols,
                                    const std::string& start,
                                    const std::string& end);

private:
    IDataSource& source_;
    IPriceRepository& repo_;
};

}  // namespace alphaforge::data
