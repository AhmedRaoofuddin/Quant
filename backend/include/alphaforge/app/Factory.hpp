#pragma once
///
/// \file Factory.hpp
/// \brief Composition root — builds concrete data sources and repositories from Config.
///
/// This is the ONE place that decides which implementation of each interface to use, so the
/// rest of the code depends only on abstractions. Selection is driven by environment:
///   AF_DATA_SOURCE = synthetic | csv          (default: synthetic)
///   AF_RUN_STORE   = file | postgres          (default: file)
///
#include <memory>

#include "alphaforge/data/DataSource.hpp"
#include "alphaforge/data/Repository.hpp"
#include "alphaforge/platform/Config.hpp"

namespace alphaforge::app {

[[nodiscard]] std::unique_ptr<data::IDataSource> make_data_source(const Config& config);
[[nodiscard]] std::unique_ptr<data::IRunRepository> make_run_repository(const Config& config);
[[nodiscard]] std::unique_ptr<data::IPriceRepository> make_price_repository(const Config& config);

}  // namespace alphaforge::app
