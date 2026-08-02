#pragma once
///
/// \file HttpServer.hpp
/// \brief A tiny dependency-free HTTP/1.1 server for the REST API.
///
/// Single-threaded, blocking accept loop — sufficient for an internal analytics service behind
/// a reverse proxy. Cross-platform (Winsock / POSIX sockets). Routes are (method, exact-path)
/// or a prefix match; handlers receive the parsed request and return a response.
///
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace alphaforge::app {

struct HttpRequest {
    std::string method;
    std::string path;                      ///< path without query string
    std::string query;                     ///< raw query string (after '?')
    std::map<std::string, std::string> headers;
    std::string body;
};

struct HttpResponse {
    int status = 200;
    std::string content_type = "application/json";
    std::string body;

    static HttpResponse json(int status, std::string body);
    static HttpResponse text(int status, std::string body);
};

using Handler = std::function<HttpResponse(const HttpRequest&)>;

class HttpServer {
public:
    HttpServer(std::string host, int port);
    ~HttpServer();

    /// Register a handler. If \p prefix is true, matches any path starting with \p path.
    void route(const std::string& method, const std::string& path, Handler handler,
               bool prefix = false);

    /// Block and serve until the process is terminated. Throws alphaforge::Error on setup failure.
    void run();

private:
    struct Route {
        std::string method;
        std::string path;
        bool prefix;
        Handler handler;
    };

    [[nodiscard]] HttpResponse dispatch(const HttpRequest& req) const;

    std::string host_;
    int port_;
    std::vector<Route> routes_;
};

}  // namespace alphaforge::app
