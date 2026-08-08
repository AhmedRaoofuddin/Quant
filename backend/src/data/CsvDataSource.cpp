#include "alphaforge/data/CsvDataSource.hpp"

#include <filesystem>
#include <fstream>
#include <sstream>

#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::data {

namespace fs = std::filesystem;

namespace {
std::vector<std::string> split(const std::string& line, char delim) {
    std::vector<std::string> out;
    std::stringstream ss(line);
    std::string cell;
    while (std::getline(ss, cell, delim)) out.push_back(cell);
    return out;
}

double to_double(const std::string& s, const std::string& file, std::size_t line_no) {
    try {
        return std::stod(s);
    } catch (const std::exception&) {
        throw DataError("CSV " + file + ": bad number '" + s + "' on line " + std::to_string(line_no));
    }
}
}  // namespace

std::vector<PriceBar> CsvDataSource::fetch(
    const std::vector<std::string>& symbols, const std::string& start, const std::string& end) {
    std::vector<PriceBar> bars;
    for (const auto& symbol : symbols) {
        const fs::path path = fs::path(root_) / (symbol + ".csv");
        if (!fs::exists(path)) {
            Logger::instance().warn("csv.missing", {field("symbol", symbol), field("path", path.string())});
            continue;
        }
        std::ifstream in(path);
        if (!in) throw DataError("Cannot open CSV file: " + path.string());

        std::string line;
        std::size_t line_no = 0;
        std::getline(in, line);  // header
        ++line_no;
        while (std::getline(in, line)) {
            ++line_no;
            if (line.empty()) continue;
            const auto cells = split(line, ',');
            if (cells.size() < 6) {
                throw DataError("CSV " + path.string() + ": expected 6 columns on line " +
                                std::to_string(line_no));
            }
            const std::string& date = cells[0];
            if (date < start || date > end) continue;  // ISO dates compare lexically
            PriceBar bar;
            bar.date = date;
            bar.symbol = symbol;
            bar.open = to_double(cells[1], path.string(), line_no);
            bar.high = to_double(cells[2], path.string(), line_no);
            bar.low = to_double(cells[3], path.string(), line_no);
            bar.close = to_double(cells[4], path.string(), line_no);
            bar.volume = to_double(cells[5], path.string(), line_no);
            bars.push_back(bar);
        }
    }
    if (bars.empty()) throw DataError("CsvDataSource: no bars found under " + root_);
    return bars;
}

}  // namespace alphaforge::data
