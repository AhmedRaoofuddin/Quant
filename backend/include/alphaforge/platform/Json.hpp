#pragma once
///
/// \file Json.hpp
/// \brief A small, dependency-free JSON value with parser and serialiser.
///
/// Alpha-Forge deliberately vendors no third-party libraries in its compiled core, so it
/// ships its own JSON codec. It is used for run persistence, the REST API payloads, and
/// parsing the LLM proposer's structured responses. The parser is strict and throws
/// alphaforge::DataError on malformed input; callers wrap that in guardrails as needed.
///
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace alphaforge {

class Json {
public:
    enum class Type { Null, Bool, Number, String, Array, Object };

    Json() : type_(Type::Null) {}
    Json(std::nullptr_t) : type_(Type::Null) {}
    Json(bool b) : type_(Type::Bool), bool_(b) {}
    Json(double n) : type_(Type::Number), num_(n) {}
    Json(int n) : type_(Type::Number), num_(n) {}
    Json(long n) : type_(Type::Number), num_(static_cast<double>(n)) {}
    Json(const char* s) : type_(Type::String), str_(s) {}
    Json(std::string s) : type_(Type::String), str_(std::move(s)) {}

    static Json array() { Json j; j.type_ = Type::Array; return j; }
    static Json object() { Json j; j.type_ = Type::Object; return j; }

    [[nodiscard]] Type type() const noexcept { return type_; }
    [[nodiscard]] bool is_null() const noexcept { return type_ == Type::Null; }
    [[nodiscard]] bool is_bool() const noexcept { return type_ == Type::Bool; }
    [[nodiscard]] bool is_number() const noexcept { return type_ == Type::Number; }
    [[nodiscard]] bool is_string() const noexcept { return type_ == Type::String; }
    [[nodiscard]] bool is_array() const noexcept { return type_ == Type::Array; }
    [[nodiscard]] bool is_object() const noexcept { return type_ == Type::Object; }

    [[nodiscard]] bool as_bool(bool fallback = false) const noexcept;
    [[nodiscard]] double as_number(double fallback = 0.0) const noexcept;
    [[nodiscard]] std::string as_string(const std::string& fallback = "") const;

    [[nodiscard]] const std::vector<Json>& items() const;   ///< array elements (throws if not array)
    [[nodiscard]] const std::map<std::string, Json>& fields() const;  ///< object members

    /// Object access: returns Null if key absent. Non-throwing read.
    [[nodiscard]] const Json& operator[](const std::string& key) const;
    [[nodiscard]] bool contains(const std::string& key) const;

    /// Mutating builders.
    void push_back(Json value);
    void set(const std::string& key, Json value);

    /// Serialise. \p indent = 0 produces compact output.
    [[nodiscard]] std::string dump(int indent = 0) const;

    /// Parse \p text or throw alphaforge::DataError.
    [[nodiscard]] static Json parse(const std::string& text);

private:
    void dump_to(std::string& out, int indent, int depth) const;

    Type type_;
    bool bool_ = false;
    double num_ = 0.0;
    std::string str_;
    std::vector<Json> arr_;
    std::map<std::string, Json> obj_;
};

}  // namespace alphaforge
