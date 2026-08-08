#pragma once
///
/// \file PostgresRepository.hpp
/// \brief Supabase/Postgres implementations of the repository interfaces (libpq).
///
/// Compiled only when ALPHAFORGE_WITH_POSTGRES is defined. Connects to the local Supabase
/// Postgres (default: postgresql://postgres:postgres@127.0.0.1:54322/postgres) and writes to
/// the `alphaforge` schema created by the migration. The connection uses the service role, so
/// it bypasses RLS as intended for the backend writer.
///
#include <string>

#include "alphaforge/data/Repository.hpp"

struct pg_conn;  // libpq's PGconn, forward-declared to keep libpq out of this header.

namespace alphaforge::data {

/// Shared, thin RAII wrapper around a libpq connection.
class PostgresConnection {
public:
    explicit PostgresConnection(const std::string& conninfo);
    ~PostgresConnection();
    PostgresConnection(const PostgresConnection&) = delete;
    PostgresConnection& operator=(const PostgresConnection&) = delete;

    [[nodiscard]] pg_conn* handle() const noexcept { return conn_; }

private:
    pg_conn* conn_ = nullptr;
};

class PostgresPriceRepository final : public IPriceRepository {
public:
    PostgresPriceRepository(const std::string& conninfo, std::string region);
    std::size_t save(const std::vector<PriceBar>& bars) override;
    [[nodiscard]] std::vector<std::string> known_symbols() const override;

private:
    PostgresConnection conn_;
    std::string region_;
};

class PostgresRunRepository final : public IRunRepository {
public:
    explicit PostgresRunRepository(const std::string& conninfo);
    void save(const std::string& run_id, const std::string& json_payload) override;
    [[nodiscard]] std::optional<std::string> load(const std::string& run_id) const override;
    [[nodiscard]] std::vector<std::string> list(std::size_t limit = 50) const override;

private:
    PostgresConnection conn_;
};

}  // namespace alphaforge::data
