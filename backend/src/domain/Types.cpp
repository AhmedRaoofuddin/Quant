#include "alphaforge/domain/Types.hpp"

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::domain {

const char* to_string(Sensitivity s) noexcept {
    switch (s) {
        case Sensitivity::Public:       return "public";
        case Sensitivity::Internal:     return "internal";
        case Sensitivity::Confidential: return "confidential";
    }
    return "internal";
}

const char* to_string(Role r) noexcept {
    switch (r) {
        case Role::Viewer:  return "viewer";
        case Role::Analyst: return "analyst";
        case Role::Admin:   return "admin";
    }
    return "viewer";
}

Role role_from_string(const std::string& s) {
    if (s == "viewer") return Role::Viewer;
    if (s == "analyst") return Role::Analyst;
    if (s == "admin") return Role::Admin;
    throw ConfigurationError("Unknown role: " + s);
}

}  // namespace alphaforge::domain
