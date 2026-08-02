///
/// \file main.cpp
/// \brief Alpha-Forge command-line entry point.
///
/// Subcommands:
///   crawl      Pull market data into the repository.
///   discover   Run the full alpha-discovery pipeline.
///   list       List recent discovery runs.
///   show <id>  Print a run's JSON.
///   serve      Start the REST API server.
///
/// The top-level handler maps each error category to a distinct exit code so operators and
/// CI can react precisely (Phase 4/6).
///
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#include "alphaforge/app/Factory.hpp"
#include "alphaforge/app/HttpServer.hpp"
#include "alphaforge/app/Pipeline.hpp"
#include "alphaforge/data/Crawler.hpp"
#include "alphaforge/dsl/AlphaLibrary.hpp"
#include "alphaforge/domain/Serialization.hpp"
#include "alphaforge/guardrails/AuditLog.hpp"
#include "alphaforge/guardrails/Guardrails.hpp"
#include "alphaforge/platform/Config.hpp"
#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Json.hpp"
#include "alphaforge/platform/Logger.hpp"

using namespace alphaforge;

namespace {

std::string arg_value(const std::vector<std::string>& args, const std::string& flag,
                      const std::string& fallback) {
    for (std::size_t i = 0; i + 1 < args.size(); ++i) {
        if (args[i] == flag) return args[i + 1];
    }
    return fallback;
}

int exit_code_for(ErrorCategory c) {
    switch (c) {
        case ErrorCategory::Configuration: return 78;  // EX_CONFIG
        case ErrorCategory::Data:          return 65;  // EX_DATAERR
        case ErrorCategory::Guardrail:     return 77;  // EX_NOPERM
        case ErrorCategory::External:      return 69;  // EX_UNAVAILABLE
        default:                           return 70;  // EX_SOFTWARE
    }
}

void print_usage() {
    std::cout <<
        "alphaforge — LLM-augmented quant alpha discovery\n\n"
        "Usage:\n"
        "  alphaforge crawl    [--start YYYY-MM-DD] [--end YYYY-MM-DD]\n"
        "  alphaforge discover [--n N] [--allocator equal|risk_parity|mean_variance]\n"
        "  alphaforge list\n"
        "  alphaforge show <run_id>\n"
        "  alphaforge serve\n";
}

int cmd_crawl(const Config& config, const std::vector<std::string>& args) {
    const std::string start = arg_value(args, "--start", config.start_date);
    const std::string end = arg_value(args, "--end", config.end_date);
    auto source = app::make_data_source(config);
    auto repo = app::make_price_repository(config);
    data::MarketDataCrawler crawler(*source, *repo);
    const data::CrawlReport report = crawler.crawl(config.universe, start, end);
    std::cout << "Crawl complete: " << report.symbols_ok << " ok, " << report.symbols_failed
              << " failed, " << report.bars_written << " bars written.\n";
    for (const auto& f : report.failures) std::cout << "  ! " << f << "\n";
    return report.symbols_failed > 0 && report.symbols_ok == 0 ? 65 : 0;
}

int cmd_discover(const Config& config, const std::vector<std::string>& args) {
    app::PipelineOptions options;
    options.n_alphas = std::stoi(arg_value(args, "--n", std::to_string(config.llm_max_alphas_per_round)));
    options.allocator_method = arg_value(args, "--allocator", "risk_parity");

    auto source = app::make_data_source(config);
    auto runs = app::make_run_repository(config);
    guardrails::AuditLog audit(config.data_dir);
    app::Pipeline pipeline(config, *source, *runs, audit);

    const domain::DiscoveryRun run =
        pipeline.run(config.universe, config.start_date, config.end_date, "cli", options);

    std::cout << "\n=== Discovery " << run.run_id << " ===\n"
              << "Proposed: " << run.n_proposed << "   Selected: " << run.n_selected << "\n";
    if (run.result) {
        std::cout << "Out-of-sample portfolio Sharpe: " << run.result->metrics.sharpe
                  << "   MaxDD: " << run.result->metrics.max_drawdown << "\n"
                  << "Allocator: " << run.result->allocation.method << "\n";
    }
    std::cout << "\nSelected alphas:\n";
    for (const auto& a : run.alphas) {
        if (!a.selected) continue;
        std::cout << "  [" << a.expression.id << "]  IS Sharpe " << a.in_sample.sharpe
                  << " | OOS " << (a.out_sample ? a.out_sample->sharpe : 0.0)
                  << " | DSR " << a.in_sample.deflated_sharpe << "\n"
                  << "      " << a.expression.expression << "\n";
    }
    std::cout << "\nRun saved. Use 'alphaforge show " << run.run_id << "' for full JSON.\n";
    return 0;
}

int cmd_list(const Config& config) {
    auto runs = app::make_run_repository(config);
    const auto ids = runs->list(50);
    if (ids.empty()) {
        std::cout << "No runs yet. Try: alphaforge discover\n";
        return 0;
    }
    std::cout << "Recent runs:\n";
    for (const auto& id : ids) std::cout << "  " << id << "\n";
    return 0;
}

int cmd_show(const Config& config, const std::vector<std::string>& args) {
    if (args.empty()) {
        std::cerr << "show requires a run_id\n";
        return 64;  // EX_USAGE
    }
    auto runs = app::make_run_repository(config);
    const auto payload = runs->load(args[0]);
    if (!payload) {
        std::cerr << "Run not found: " << args[0] << "\n";
        return 65;
    }
    std::cout << *payload << "\n";
    return 0;
}

int cmd_serve(const Config& config) {
    auto runs = std::shared_ptr<data::IRunRepository>(app::make_run_repository(config));
    auto audit = std::make_shared<guardrails::AuditLog>(config.data_dir);
    auto limiter = std::make_shared<guardrails::RateLimiter>(config.rate_limit_per_minute);

    app::HttpServer server(config.api_host, config.api_port);

    server.route("GET", "/health", [](const app::HttpRequest&) {
        return app::HttpResponse::json(200, "{\"status\":\"ok\",\"service\":\"alpha-forge\"}");
    });

    server.route("GET", "/api/alphas/library", [](const app::HttpRequest&) {
        Json arr = Json::array();
        for (const auto& lib : dsl::alpha_library()) {
            Json o = Json::object();
            o.set("expression", lib.expression);
            o.set("rationale", lib.rationale);
            arr.push_back(o);
        }
        return app::HttpResponse::json(200, arr.dump());
    });

    server.route("GET", "/api/runs", [runs](const app::HttpRequest&) {
        Json arr = Json::array();
        for (const auto& id : runs->list(50)) arr.push_back(id);
        return app::HttpResponse::json(200, arr.dump());
    });

    server.route("GET", "/api/runs/", [runs](const app::HttpRequest& req) {
        const std::string id = req.path.substr(std::string("/api/runs/").size());
        const auto payload = runs->load(id);
        if (!payload) return app::HttpResponse::json(404, "{\"error\":\"run not found\"}");
        return app::HttpResponse::json(200, *payload);
    }, /*prefix=*/true);

    server.route("POST", "/api/discover", [&config, runs, audit, limiter](const app::HttpRequest& req) {
        const std::string actor = "api";
        if (!limiter->allow(actor)) {
            return app::HttpResponse::json(429, "{\"error\":\"rate limited\"}");
        }
        app::PipelineOptions options;
        try {
            if (!req.body.empty()) {
                const Json body = Json::parse(req.body);
                if (body.contains("n")) options.n_alphas = static_cast<int>(body["n"].as_number(8));
                if (body.contains("allocator")) options.allocator_method = body["allocator"].as_string("risk_parity");
            }
        } catch (const DataError&) {
            return app::HttpResponse::json(400, "{\"error\":\"invalid JSON body\"}");
        }
        auto source = app::make_data_source(config);
        app::Pipeline pipeline(config, *source, *runs, *audit);
        const domain::DiscoveryRun run =
            pipeline.run(config.universe, config.start_date, config.end_date, actor, options);
        return app::HttpResponse::json(201, domain::to_json(run).dump());
    });

    server.run();  // blocks
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    std::vector<std::string> args(argv + (argc > 0 ? 1 : 0), argv + argc);
    if (args.empty() || args[0] == "-h" || args[0] == "--help" || args[0] == "help") {
        print_usage();
        return args.empty() ? 64 : 0;
    }

    try {
        const Config config = Config::from_environment();
        Logger::instance().set_level(LogLevel::Info);
        Logger::instance().set_json(config.log_json);
        config.enforce_production_safety();

        const std::string command = args[0];
        const std::vector<std::string> rest(args.begin() + 1, args.end());

        if (command == "crawl") return cmd_crawl(config, rest);
        if (command == "discover") return cmd_discover(config, rest);
        if (command == "list") return cmd_list(config);
        if (command == "show") return cmd_show(config, rest);
        if (command == "serve") return cmd_serve(config);

        std::cerr << "Unknown command: " << command << "\n\n";
        print_usage();
        return 64;
    } catch (const Error& e) {
        Logger::instance().error("fatal", {field("category", to_string(e.category())),
                                           field("error", e.what())});
        std::cerr << "Error [" << to_string(e.category()) << "]: " << e.what() << "\n";
        return exit_code_for(e.category());
    } catch (const std::exception& e) {
        std::cerr << "Fatal: " << e.what() << "\n";
        return 70;
    }
}
