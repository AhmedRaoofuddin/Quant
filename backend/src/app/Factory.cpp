#include "alphaforge/app/Factory.hpp"

#include <cstdlib>
#include <memory>

#include "alphaforge/data/CsvDataSource.hpp"
#include "alphaforge/data/SyntheticDataSource.hpp"
#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

#if defined(ALPHAFORGE_WITH_POSTGRES)
#include "alphaforge/data/PostgresRepository.hpp"
#endif

namespace alphaforge::app {

namespace {
std::string env_or(const char* key, const std::string& fallback) {
    const char* v = std::getenv(key);
    return v ? std::string(v) : fallback;
}
}  // namespace

std::unique_ptr<data::IDataSource> make_data_source(const Config& config) {
    const std::string kind = env_or("AF_DATA_SOURCE", "synthetic");
    if (kind == "csv") {
        return std::make_unique<data::CsvDataSource>(config.data_dir + "/prices");
    }
    if (kind == "synthetic") {
        return std::make_unique<data::SyntheticDataSource>(42);
    }
    throw ConfigurationError("Unknown AF_DATA_SOURCE: " + kind);
}

std::unique_ptr<data::IRunRepository> make_run_repository(const Config& config) {
    const std::string kind = env_or("AF_RUN_STORE", "file");
    if (kind == "postgres") {
#if defined(ALPHAFORGE_WITH_POSTGRES)
        return std::make_unique<data::PostgresRunRepository>(env_or("AF_DB_URL", ""));
#else
        Logger::instance().warn("factory.postgres_unavailable_fallback_file");
        return std::make_unique<data::FileRunRepository>(config.data_dir);
#endif
    }
    return std::make_unique<data::FileRunRepository>(config.data_dir);
}

std::unique_ptr<data::IPriceRepository> make_price_repository(const Config& config) {
    const std::string kind = env_or("AF_RUN_STORE", "file");
    if (kind == "postgres") {
#if defined(ALPHAFORGE_WITH_POSTGRES)
        return std::make_unique<data::PostgresPriceRepository>(env_or("AF_DB_URL", ""), config.region);
#else
        Logger::instance().warn("factory.postgres_unavailable_fallback_file");
        return std::make_unique<data::FilePriceRepository>(config.data_dir, config.region);
#endif
    }
    return std::make_unique<data::FilePriceRepository>(config.data_dir, config.region);
}

}  // namespace alphaforge::app
