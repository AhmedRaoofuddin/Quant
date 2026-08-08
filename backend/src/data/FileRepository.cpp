#include "alphaforge/data/Repository.hpp"

#include <algorithm>
#include <optional>
#include <filesystem>
#include <fstream>
#include <map>

#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::data {

namespace fs = std::filesystem;

// --- FilePriceRepository ----------------------------------------------------
FilePriceRepository::FilePriceRepository(std::string data_dir, std::string region)
    : prices_dir_((fs::path(data_dir) / "prices").string()), region_(std::move(region)) {
    std::error_code ec;
    fs::create_directories(prices_dir_, ec);
    if (ec) throw DataError("Cannot create prices dir: " + ec.message());
}

std::size_t FilePriceRepository::save(const std::vector<PriceBar>& bars) {
    if (bars.empty()) return 0;
    // Group by symbol so each file is written once (idempotent overwrite).
    std::map<std::string, std::vector<const PriceBar*>> by_symbol;
    for (const auto& b : bars) by_symbol[b.symbol].push_back(&b);

    std::size_t written = 0;
    for (auto& [symbol, rows] : by_symbol) {
        std::sort(rows.begin(), rows.end(),
                  [](const PriceBar* a, const PriceBar* b) { return a->date < b->date; });
        const fs::path path = fs::path(prices_dir_) / (symbol + ".csv");
        std::ofstream out(path, std::ios::trunc);
        if (!out) throw DataError("Cannot write CSV: " + path.string());
        out << "date,open,high,low,close,volume\n";
        for (const PriceBar* b : rows) {
            out << b->date << ',' << b->open << ',' << b->high << ',' << b->low << ','
                << b->close << ',' << b->volume << '\n';
            ++written;
        }
    }
    // Residency sidecar for the data-governance audit.
    std::ofstream region_file(fs::path(prices_dir_) / "_region.txt", std::ios::trunc);
    region_file << region_ << '\n';

    Logger::instance().info("repo.prices.save",
                            {field("symbols", static_cast<long>(by_symbol.size())),
                             field("bars", static_cast<long>(written)),
                             field("region", region_)});
    return written;
}

std::vector<std::string> FilePriceRepository::known_symbols() const {
    std::vector<std::string> symbols;
    if (!fs::exists(prices_dir_)) return symbols;
    for (const auto& entry : fs::directory_iterator(prices_dir_)) {
        if (entry.path().extension() == ".csv") symbols.push_back(entry.path().stem().string());
    }
    std::sort(symbols.begin(), symbols.end());
    return symbols;
}

// --- FileRunRepository ------------------------------------------------------
FileRunRepository::FileRunRepository(std::string data_dir)
    : runs_dir_((fs::path(data_dir) / "runs").string()) {
    std::error_code ec;
    fs::create_directories(runs_dir_, ec);
    if (ec) throw DataError("Cannot create runs dir: " + ec.message());
}

void FileRunRepository::save(const std::string& run_id, const std::string& json_payload) {
    const fs::path path = fs::path(runs_dir_) / (run_id + ".json");
    std::ofstream out(path, std::ios::trunc);
    if (!out) throw DataError("Cannot write run: " + path.string());
    out << json_payload;
    Logger::instance().info("repo.run.save", {field("run_id", run_id)});
}

std::optional<std::string> FileRunRepository::load(const std::string& run_id) const {
    const fs::path path = fs::path(runs_dir_) / (run_id + ".json");
    if (!fs::exists(path)) return std::nullopt;
    std::ifstream in(path);
    if (!in) throw DataError("Cannot read run: " + path.string());
    std::string content((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    return content;
}

std::vector<std::string> FileRunRepository::list(std::size_t limit) const {
    std::vector<fs::directory_entry> entries;
    if (fs::exists(runs_dir_)) {
        for (const auto& e : fs::directory_iterator(runs_dir_)) {
            if (e.path().extension() == ".json") entries.push_back(e);
        }
    }
    std::sort(entries.begin(), entries.end(), [](const auto& a, const auto& b) {
        return a.last_write_time() > b.last_write_time();  // newest first
    });
    std::vector<std::string> ids;
    for (const auto& e : entries) {
        if (ids.size() >= limit) break;
        ids.push_back(e.path().stem().string());
    }
    return ids;
}

}  // namespace alphaforge::data
