#include "alphaforge/platform/Json.hpp"

#include <cctype>
#include <cmath>
#include <cstdio>
#include <sstream>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge {

namespace {
const Json kNull{};

void escape_to(std::string& out, const std::string& s) {
    out += '"';
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    out += '"';
}

std::string number_to_string(double n) {
    if (std::isnan(n) || std::isinf(n)) return "null";  // JSON has no NaN/Inf
    if (n == static_cast<long long>(n) && std::fabs(n) < 1e15) {
        return std::to_string(static_cast<long long>(n));
    }
    std::ostringstream os;
    os.precision(10);
    os << n;
    return os.str();
}

/// Recursive-descent JSON parser over a string cursor.
class Parser {
public:
    explicit Parser(const std::string& text) : s_(text) {}

    Json parse() {
        skip_ws();
        Json v = parse_value();
        skip_ws();
        if (pos_ != s_.size()) fail("trailing characters after JSON value");
        return v;
    }

private:
    [[noreturn]] void fail(const std::string& why) {
        throw DataError("JSON parse error at offset " + std::to_string(pos_) + ": " + why);
    }

    void skip_ws() {
        while (pos_ < s_.size() &&
               (s_[pos_] == ' ' || s_[pos_] == '\t' || s_[pos_] == '\n' || s_[pos_] == '\r')) {
            ++pos_;
        }
    }

    char peek() { return pos_ < s_.size() ? s_[pos_] : '\0'; }
    char get() { return pos_ < s_.size() ? s_[pos_++] : '\0'; }

    Json parse_value() {
        skip_ws();
        const char c = peek();
        switch (c) {
            case '{': return parse_object();
            case '[': return parse_array();
            case '"': return Json(parse_string());
            case 't': case 'f': return parse_bool();
            case 'n': return parse_null();
            default:
                if (c == '-' || std::isdigit(static_cast<unsigned char>(c))) return parse_number();
                fail("unexpected character");
        }
    }

    Json parse_object() {
        Json obj = Json::object();
        get();  // consume '{'
        skip_ws();
        if (peek() == '}') { get(); return obj; }
        while (true) {
            skip_ws();
            if (peek() != '"') fail("expected string key");
            std::string key = parse_string();
            skip_ws();
            if (get() != ':') fail("expected ':' after key");
            obj.set(key, parse_value());
            skip_ws();
            const char c = get();
            if (c == '}') break;
            if (c != ',') fail("expected ',' or '}' in object");
        }
        return obj;
    }

    Json parse_array() {
        Json arr = Json::array();
        get();  // consume '['
        skip_ws();
        if (peek() == ']') { get(); return arr; }
        while (true) {
            arr.push_back(parse_value());
            skip_ws();
            const char c = get();
            if (c == ']') break;
            if (c != ',') fail("expected ',' or ']' in array");
        }
        return arr;
    }

    std::string parse_string() {
        if (get() != '"') fail("expected opening quote");
        std::string out;
        while (true) {
            if (pos_ >= s_.size()) fail("unterminated string");
            char c = get();
            if (c == '"') break;
            if (c == '\\') {
                char e = get();
                switch (e) {
                    case '"': out += '"'; break;
                    case '\\': out += '\\'; break;
                    case '/': out += '/'; break;
                    case 'n': out += '\n'; break;
                    case 't': out += '\t'; break;
                    case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'u': {
                        if (pos_ + 4 > s_.size()) fail("bad \\u escape");
                        int code = std::stoi(s_.substr(pos_, 4), nullptr, 16);
                        pos_ += 4;
                        // Minimal BMP handling: encode as UTF-8.
                        if (code < 0x80) {
                            out += static_cast<char>(code);
                        } else if (code < 0x800) {
                            out += static_cast<char>(0xC0 | (code >> 6));
                            out += static_cast<char>(0x80 | (code & 0x3F));
                        } else {
                            out += static_cast<char>(0xE0 | (code >> 12));
                            out += static_cast<char>(0x80 | ((code >> 6) & 0x3F));
                            out += static_cast<char>(0x80 | (code & 0x3F));
                        }
                        break;
                    }
                    default: fail("invalid escape");
                }
            } else {
                out += c;
            }
        }
        return out;
    }

    Json parse_number() {
        const std::size_t start = pos_;
        if (peek() == '-') get();
        while (std::isdigit(static_cast<unsigned char>(peek()))) get();
        if (peek() == '.') { get(); while (std::isdigit(static_cast<unsigned char>(peek()))) get(); }
        if (peek() == 'e' || peek() == 'E') {
            get();
            if (peek() == '+' || peek() == '-') get();
            while (std::isdigit(static_cast<unsigned char>(peek()))) get();
        }
        return Json(std::stod(s_.substr(start, pos_ - start)));
    }

    Json parse_bool() {
        if (s_.compare(pos_, 4, "true") == 0) { pos_ += 4; return Json(true); }
        if (s_.compare(pos_, 5, "false") == 0) { pos_ += 5; return Json(false); }
        fail("invalid literal");
    }

    Json parse_null() {
        if (s_.compare(pos_, 4, "null") == 0) { pos_ += 4; return Json(nullptr); }
        fail("invalid literal");
    }

    const std::string& s_;
    std::size_t pos_ = 0;
};
}  // namespace

bool Json::as_bool(bool fallback) const noexcept { return is_bool() ? bool_ : fallback; }
double Json::as_number(double fallback) const noexcept { return is_number() ? num_ : fallback; }
std::string Json::as_string(const std::string& fallback) const {
    return is_string() ? str_ : fallback;
}

const std::vector<Json>& Json::items() const {
    if (!is_array()) throw InternalError("Json::items() on non-array");
    return arr_;
}

const std::map<std::string, Json>& Json::fields() const {
    if (!is_object()) throw InternalError("Json::fields() on non-object");
    return obj_;
}

const Json& Json::operator[](const std::string& key) const {
    if (!is_object()) return kNull;
    auto it = obj_.find(key);
    return it == obj_.end() ? kNull : it->second;
}

bool Json::contains(const std::string& key) const {
    return is_object() && obj_.find(key) != obj_.end();
}

void Json::push_back(Json value) {
    if (!is_array()) throw InternalError("Json::push_back on non-array");
    arr_.push_back(std::move(value));
}

void Json::set(const std::string& key, Json value) {
    if (!is_object()) throw InternalError("Json::set on non-object");
    obj_[key] = std::move(value);
}

void Json::dump_to(std::string& out, int indent, int depth) const {
    const bool pretty = indent > 0;
    const std::string pad = pretty ? std::string(static_cast<std::size_t>(indent) * (depth + 1), ' ') : "";
    const std::string pad_close = pretty ? std::string(static_cast<std::size_t>(indent) * depth, ' ') : "";
    const char* nl = pretty ? "\n" : "";

    switch (type_) {
        case Type::Null: out += "null"; break;
        case Type::Bool: out += bool_ ? "true" : "false"; break;
        case Type::Number: out += number_to_string(num_); break;
        case Type::String: escape_to(out, str_); break;
        case Type::Array: {
            if (arr_.empty()) { out += "[]"; break; }
            out += '[';
            out += nl;
            for (std::size_t i = 0; i < arr_.size(); ++i) {
                out += pad;
                arr_[i].dump_to(out, indent, depth + 1);
                if (i + 1 < arr_.size()) out += ',';
                out += nl;
            }
            out += pad_close;
            out += ']';
            break;
        }
        case Type::Object: {
            if (obj_.empty()) { out += "{}"; break; }
            out += '{';
            out += nl;
            std::size_t i = 0;
            for (const auto& [k, v] : obj_) {
                out += pad;
                escape_to(out, k);
                out += pretty ? ": " : ":";
                v.dump_to(out, indent, depth + 1);
                if (++i < obj_.size()) out += ',';
                out += nl;
            }
            out += pad_close;
            out += '}';
            break;
        }
    }
}

std::string Json::dump(int indent) const {
    std::string out;
    dump_to(out, indent, 0);
    return out;
}

Json Json::parse(const std::string& text) {
    Parser parser(text);
    return parser.parse();
}

}  // namespace alphaforge
