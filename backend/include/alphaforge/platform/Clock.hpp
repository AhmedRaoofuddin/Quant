#pragma once
///
/// \file Clock.hpp
/// \brief Time helpers used for timestamps and run ids.
///
#include <string>

namespace alphaforge {

/// Current UTC time as ISO-8601 (e.g. 2026-08-01T12:34:56Z).
[[nodiscard]] std::string now_iso8601();

/// A sortable, unique-ish run id: run_YYYYMMDDTHHMMSSZ_<suffix>.
[[nodiscard]] std::string make_run_id(const std::string& suffix = "");

}  // namespace alphaforge
