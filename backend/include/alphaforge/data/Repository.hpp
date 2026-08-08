#pragma once
///
/// \file Repository.hpp
/// \brief Persistence abstractions (Repository pattern) + file-backed implementations.
///
/// The pipeline and crawler depend on these interfaces, not on a concrete store. The default
/// implementations write CSV (price bars) and JSON (runs) under the data directory, stamped with
/// the residency region. In production, a Postgres/TimescaleDB adapter and an object-store
/// adapter implement the same interfaces with zero change to callers.
///
#include <optional>
#include <string>
#include <vector>

#include "alphaforge/data/MarketData.hpp"

namespace alphaforge::data {

/// Stores and retrieves raw OHLCV bars (the crawler's output).
class IPriceRepository {
public:
    virtual ~IPriceRepository() = default;
    /// Persist bars (idempotent per symbol). Returns number of bars written.
    virtual std::size_t save(const std::vector<PriceBar>& bars) = 0;
    [[nodiscard]] virtual std::vector<std::string> known_symbols() const = 0;
};

/// Stores and retrieves serialised DiscoveryRun records.
class IRunRepository {
public:
    virtual ~IRunRepository() = default;
    virtual void save(const std::string& run_id, const std::string& json_payload) = 0;
    [[nodiscard]] virtual std::optional<std::string> load(const std::string& run_id) const = 0;
    [[nodiscard]] virtual std::vector<std::string> list(std::size_t limit = 50) const = 0;
};

/// File-backed price repository: <root>/prices/<SYMBOL>.csv, stamped region in a sidecar.
class FilePriceRepository final : public IPriceRepository {
public:
    FilePriceRepository(std::string data_dir, std::string region);
    std::size_t save(const std::vector<PriceBar>& bars) override;
    [[nodiscard]] std::vector<std::string> known_symbols() const override;
    [[nodiscard]] std::string prices_dir() const { return prices_dir_; }

private:
    std::string prices_dir_;
    std::string region_;
};

/// File-backed run repository: <root>/runs/<run_id>.json, newest-first listing.
class FileRunRepository final : public IRunRepository {
public:
    explicit FileRunRepository(std::string data_dir);
    void save(const std::string& run_id, const std::string& json_payload) override;
    [[nodiscard]] std::optional<std::string> load(const std::string& run_id) const override;
    [[nodiscard]] std::vector<std::string> list(std::size_t limit = 50) const override;

private:
    std::string runs_dir_;
};

}  // namespace alphaforge::data
