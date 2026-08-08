#include "alphaforge/data/SyntheticDataSource.hpp"

#include <chrono>
#include <cmath>
#include <random>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::data {

namespace {
using namespace std::chrono;

/// Parse "YYYY-MM-DD" into a chrono sys_days, throwing DataError on malformed input.
sys_days parse_date(const std::string& s) {
    int y = 0, m = 0, d = 0;
    if (std::sscanf(s.c_str(), "%d-%d-%d", &y, &m, &d) != 3) {
        throw DataError("Invalid date (expected YYYY-MM-DD): " + s);
    }
    return sys_days{year{y} / month{static_cast<unsigned>(m)} / day{static_cast<unsigned>(d)}};
}

std::string format_date(sys_days sd) {
    const year_month_day ymd{sd};
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%04d-%02u-%02u", static_cast<int>(ymd.year()),
                  static_cast<unsigned>(ymd.month()), static_cast<unsigned>(ymd.day()));
    return buf;
}

/// Business days (Mon–Fri) in [start, end], inclusive.
std::vector<std::string> business_days(const std::string& start, const std::string& end) {
    const sys_days s = parse_date(start);
    const sys_days e = parse_date(end);
    if (e < s) throw DataError("end date precedes start date");
    std::vector<std::string> out;
    for (sys_days d = s; d <= e; d += days{1}) {
        const weekday wd{d};
        if (wd != Saturday && wd != Sunday) out.push_back(format_date(d));
    }
    return out;
}
}  // namespace

std::vector<PriceBar> SyntheticDataSource::fetch(
    const std::vector<std::string>& symbols, const std::string& start, const std::string& end) {
    if (symbols.empty()) throw DataError("SyntheticDataSource: empty symbol list");

    const std::vector<std::string> dates = business_days(start, end);
    const std::size_t n_days = dates.size();
    if (n_days < 2) throw DataError("SyntheticDataSource: date range too short");

    std::mt19937_64 rng(seed_);
    std::normal_distribution<double> market_dist(0.0003, 0.01);

    // Shared market factor drives common variance across names.
    std::vector<double> market(n_days);
    for (double& m : market) m = market_dist(rng);

    std::vector<PriceBar> bars;
    bars.reserve(symbols.size() * n_days);

    for (std::size_t i = 0; i < symbols.size(); ++i) {
        std::uniform_real_distribution<double> unit(0.0, 1.0);
        std::normal_distribution<double> idio_dist(0.0, 0.012);
        std::normal_distribution<double> micro(0.0, 0.002);
        std::normal_distribution<double> wick(0.0, 0.003);
        std::uniform_real_distribution<double> vol_dist(1e6, 2e7);

        const double beta = 0.6 + 0.8 * unit(rng);
        double prev_idio = 0.0;
        double price = 100.0;

        for (std::size_t t = 0; t < n_days; ++t) {
            // EWMA-smoothed idiosyncratic component -> mild autocorrelation.
            const double raw_idio = idio_dist(rng);
            prev_idio = 0.5 * prev_idio + 0.5 * raw_idio;
            const double ret = beta * market[t] + prev_idio;
            price *= std::exp(ret);

            PriceBar bar;
            bar.date = dates[t];
            bar.symbol = symbols[i];
            bar.close = price;
            bar.open = price * (1.0 + micro(rng));
            const double hi_base = std::max(bar.open, bar.close);
            const double lo_base = std::min(bar.open, bar.close);
            bar.high = hi_base * (1.0 + std::fabs(wick(rng)));
            bar.low = lo_base * (1.0 - std::fabs(wick(rng)));
            bar.volume = vol_dist(rng) * (1.0 + 0.1 * static_cast<double>(i));
            bars.push_back(bar);
        }
    }
    return bars;
}

}  // namespace alphaforge::data
