// Compiled only when built WITH_POSTGRES; otherwise this is an empty translation unit so the
// default zero-dependency build never needs libpq.
#if defined(ALPHAFORGE_WITH_POSTGRES)

#include "alphaforge/data/PostgresRepository.hpp"

#include <libpq-fe.h>

#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

namespace alphaforge::data {

namespace {
std::string default_conninfo(const std::string& conninfo) {
    return conninfo.empty() ? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" : conninfo;
}
}  // namespace

PostgresConnection::PostgresConnection(const std::string& conninfo) {
    conn_ = PQconnectdb(default_conninfo(conninfo).c_str());
    if (PQstatus(conn_) != CONNECTION_OK) {
        const std::string err = PQerrorMessage(conn_);
        PQfinish(conn_);
        conn_ = nullptr;
        throw DataError("Postgres connection failed: " + err);
    }
}

PostgresConnection::~PostgresConnection() {
    if (conn_) PQfinish(conn_);
}

// --- prices -----------------------------------------------------------------
PostgresPriceRepository::PostgresPriceRepository(const std::string& conninfo, std::string region)
    : conn_(conninfo), region_(std::move(region)) {}

std::size_t PostgresPriceRepository::save(const std::vector<PriceBar>& bars) {
    if (bars.empty()) return 0;
    PGconn* c = conn_.handle();
    if (PQexec(c, "BEGIN") == nullptr) throw DataError("Postgres BEGIN failed");

    const char* sql =
        "INSERT INTO alphaforge.prices (symbol, trade_date, open, high, low, close, volume, region) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8) "
        "ON CONFLICT (symbol, trade_date) DO UPDATE SET "
        "open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, "
        "volume=excluded.volume, region=excluded.region";

    std::size_t written = 0;
    for (const auto& b : bars) {
        const std::string open = std::to_string(b.open), high = std::to_string(b.high);
        const std::string low = std::to_string(b.low), close = std::to_string(b.close);
        const std::string vol = std::to_string(b.volume);
        const char* params[8] = {b.symbol.c_str(), b.date.c_str(), open.c_str(), high.c_str(),
                                 low.c_str(),      close.c_str(),  vol.c_str(),   region_.c_str()};
        PGresult* res = PQexecParams(c, sql, 8, nullptr, params, nullptr, nullptr, 0);
        const bool ok = PQresultStatus(res) == PGRES_COMMAND_OK;
        PQclear(res);
        if (!ok) {
            PQexec(c, "ROLLBACK");
            throw DataError(std::string("Postgres insert failed: ") + PQerrorMessage(c));
        }
        ++written;
    }
    PQclear(PQexec(c, "COMMIT"));
    Logger::instance().info("pg.prices.save", {field("bars", static_cast<long>(written))});
    return written;
}

std::vector<std::string> PostgresPriceRepository::known_symbols() const {
    PGresult* res = PQexec(conn_.handle(),
                           "SELECT DISTINCT symbol FROM alphaforge.prices ORDER BY symbol");
    std::vector<std::string> out;
    if (PQresultStatus(res) == PGRES_TUPLES_OK) {
        for (int i = 0; i < PQntuples(res); ++i) out.emplace_back(PQgetvalue(res, i, 0));
    }
    PQclear(res);
    return out;
}

// --- runs -------------------------------------------------------------------
PostgresRunRepository::PostgresRunRepository(const std::string& conninfo) : conn_(conninfo) {}

void PostgresRunRepository::save(const std::string& run_id, const std::string& json_payload) {
    const char* sql =
        "INSERT INTO alphaforge.runs (run_id, payload) VALUES ($1, $2::jsonb) "
        "ON CONFLICT (run_id) DO UPDATE SET payload = excluded.payload";
    const char* params[2] = {run_id.c_str(), json_payload.c_str()};
    PGresult* res = PQexecParams(conn_.handle(), sql, 2, nullptr, params, nullptr, nullptr, 0);
    const bool ok = PQresultStatus(res) == PGRES_COMMAND_OK;
    PQclear(res);
    if (!ok) throw DataError(std::string("Postgres run save failed: ") + PQerrorMessage(conn_.handle()));
}

std::optional<std::string> PostgresRunRepository::load(const std::string& run_id) const {
    const char* params[1] = {run_id.c_str()};
    PGresult* res = PQexecParams(conn_.handle(),
                                 "SELECT payload::text FROM alphaforge.runs WHERE run_id = $1",
                                 1, nullptr, params, nullptr, nullptr, 0);
    std::optional<std::string> out;
    if (PQresultStatus(res) == PGRES_TUPLES_OK && PQntuples(res) == 1) {
        out = std::string(PQgetvalue(res, 0, 0));
    }
    PQclear(res);
    return out;
}

std::vector<std::string> PostgresRunRepository::list(std::size_t limit) const {
    const std::string sql =
        "SELECT run_id FROM alphaforge.runs ORDER BY created_at DESC LIMIT " + std::to_string(limit);
    PGresult* res = PQexec(conn_.handle(), sql.c_str());
    std::vector<std::string> out;
    if (PQresultStatus(res) == PGRES_TUPLES_OK) {
        for (int i = 0; i < PQntuples(res); ++i) out.emplace_back(PQgetvalue(res, i, 0));
    }
    PQclear(res);
    return out;
}

}  // namespace alphaforge::data

#endif  // ALPHAFORGE_WITH_POSTGRES
