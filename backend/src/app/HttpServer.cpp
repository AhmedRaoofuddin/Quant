#include "alphaforge/app/HttpServer.hpp"

#include <cctype>
#include <cstring>
#include <sstream>

#include "alphaforge/platform/Error.hpp"
#include "alphaforge/platform/Logger.hpp"

#if defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
using socket_t = SOCKET;
static constexpr socket_t kInvalid = INVALID_SOCKET;
#define CLOSESOCK closesocket
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using socket_t = int;
static constexpr socket_t kInvalid = -1;
#define CLOSESOCK ::close
#endif

namespace alphaforge::app {

namespace {
const char* status_text(int code) {
    switch (code) {
        case 200: return "OK";
        case 201: return "Created";
        case 400: return "Bad Request";
        case 401: return "Unauthorized";
        case 404: return "Not Found";
        case 405: return "Method Not Allowed";
        case 429: return "Too Many Requests";
        case 500: return "Internal Server Error";
        default:  return "OK";
    }
}

/// Read a full HTTP request (headers + Content-Length body) from a socket.
bool read_request(socket_t client, HttpRequest& req) {
    std::string buffer;
    char chunk[4096];
    std::size_t header_end = std::string::npos;

    // Read until end of headers.
    while (header_end == std::string::npos) {
        const int n = recv(client, chunk, sizeof(chunk), 0);
        if (n <= 0) return false;
        buffer.append(chunk, static_cast<std::size_t>(n));
        header_end = buffer.find("\r\n\r\n");
        if (buffer.size() > (1u << 20)) return false;  // 1 MB header cap
    }

    const std::string head = buffer.substr(0, header_end);
    std::string body = buffer.substr(header_end + 4);

    std::istringstream stream(head);
    std::string request_line;
    std::getline(stream, request_line);
    if (!request_line.empty() && request_line.back() == '\r') request_line.pop_back();

    std::istringstream rl(request_line);
    std::string target;
    rl >> req.method >> target;
    const auto qpos = target.find('?');
    if (qpos != std::string::npos) {
        req.path = target.substr(0, qpos);
        req.query = target.substr(qpos + 1);
    } else {
        req.path = target;
    }

    std::string line;
    std::size_t content_length = 0;
    while (std::getline(stream, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        const auto colon = line.find(':');
        if (colon == std::string::npos) continue;
        std::string key = line.substr(0, colon);
        std::string value = line.substr(colon + 1);
        while (!value.empty() && value.front() == ' ') value.erase(value.begin());
        for (char& c : key) c = static_cast<char>(std::tolower(c));
        req.headers[key] = value;
        if (key == "content-length") content_length = std::stoul(value);
    }

    // Read remaining body bytes if needed.
    while (body.size() < content_length) {
        const int n = recv(client, chunk, sizeof(chunk), 0);
        if (n <= 0) break;
        body.append(chunk, static_cast<std::size_t>(n));
    }
    req.body = body;
    return true;
}

void send_response(socket_t client, const HttpResponse& res) {
    std::ostringstream os;
    os << "HTTP/1.1 " << res.status << ' ' << status_text(res.status) << "\r\n"
       << "Content-Type: " << res.content_type << "\r\n"
       << "Content-Length: " << res.body.size() << "\r\n"
       << "Access-Control-Allow-Origin: *\r\n"
       << "Access-Control-Allow-Headers: content-type, authorization\r\n"
       << "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
       << "Connection: close\r\n\r\n"
       << res.body;
    const std::string out = os.str();
    send(client, out.data(), static_cast<int>(out.size()), 0);
}
}  // namespace

HttpResponse HttpResponse::json(int status, std::string body) {
    return {status, "application/json", std::move(body)};
}
HttpResponse HttpResponse::text(int status, std::string body) {
    return {status, "text/plain", std::move(body)};
}

HttpServer::HttpServer(std::string host, int port) : host_(std::move(host)), port_(port) {
#if defined(_WIN32)
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        throw InternalError("WSAStartup failed");
    }
#endif
}

HttpServer::~HttpServer() {
#if defined(_WIN32)
    WSACleanup();
#endif
}

void HttpServer::route(const std::string& method, const std::string& path, Handler handler,
                       bool prefix) {
    routes_.push_back({method, path, prefix, std::move(handler)});
}

HttpResponse HttpServer::dispatch(const HttpRequest& req) const {
    if (req.method == "OPTIONS") return HttpResponse::text(200, "");
    for (const auto& r : routes_) {
        if (r.method != req.method) continue;
        const bool match = r.prefix ? req.path.rfind(r.path, 0) == 0 : req.path == r.path;
        if (match) {
            try {
                return r.handler(req);
            } catch (const Error& e) {
                return HttpResponse::json(500, std::string("{\"error\":\"") + e.what() + "\"}");
            } catch (const std::exception& e) {
                return HttpResponse::json(500, std::string("{\"error\":\"") + e.what() + "\"}");
            }
        }
    }
    return HttpResponse::json(404, "{\"error\":\"not found\"}");
}

void HttpServer::run() {
    socket_t server = socket(AF_INET, SOCK_STREAM, 0);
    if (server == kInvalid) throw InternalError("socket() failed");

    int opt = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&opt), sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<unsigned short>(port_));
    addr.sin_addr.s_addr = (host_ == "0.0.0.0") ? INADDR_ANY : inet_addr(host_.c_str());

    if (bind(server, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        CLOSESOCK(server);
        throw InternalError("bind() failed on port " + std::to_string(port_));
    }
    if (listen(server, 16) != 0) {
        CLOSESOCK(server);
        throw InternalError("listen() failed");
    }

    Logger::instance().info("http.listening", {field("host", host_), field("port", static_cast<long>(port_))});

    while (true) {
        socket_t client = accept(server, nullptr, nullptr);
        if (client == kInvalid) continue;
        HttpRequest req;
        if (read_request(client, req)) {
            const HttpResponse res = dispatch(req);
            Logger::instance().info("http.request", {field("method", req.method),
                                                     field("path", req.path),
                                                     field("status", static_cast<long>(res.status))});
            send_response(client, res);
        }
        CLOSESOCK(client);
    }
}

}  // namespace alphaforge::app
