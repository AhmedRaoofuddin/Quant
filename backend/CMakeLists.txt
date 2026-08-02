cmake_minimum_required(VERSION 3.20)
project(alpha_forge VERSION 1.0.0 LANGUAGES CXX)

# ---------------------------------------------------------------------------
# Standards & warnings
# ---------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

if(MSVC)
    add_compile_options(/W4 /permissive-)
else()
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# ---------------------------------------------------------------------------
# Optional integrations
# ---------------------------------------------------------------------------
option(ALPHAFORGE_WITH_CURL "Enable the Claude LLM proposer via libcurl" OFF)
option(ALPHAFORGE_WITH_POSTGRES "Enable the Supabase/Postgres repository via libpq" OFF)

# ---------------------------------------------------------------------------
# Core library (everything under src/, excluding app entry points)
# ---------------------------------------------------------------------------
file(GLOB_RECURSE ALPHAFORGE_SOURCES CONFIGURE_DEPENDS "src/*.cpp")

add_library(alphaforge_core STATIC ${ALPHAFORGE_SOURCES})
target_include_directories(alphaforge_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")

if(ALPHAFORGE_WITH_CURL)
    find_package(CURL REQUIRED)
    target_compile_definitions(alphaforge_core PUBLIC ALPHAFORGE_WITH_CURL)
    target_link_libraries(alphaforge_core PUBLIC CURL::libcurl)
endif()

if(ALPHAFORGE_WITH_POSTGRES)
    find_package(PostgreSQL REQUIRED)
    target_compile_definitions(alphaforge_core PUBLIC ALPHAFORGE_WITH_POSTGRES)
    target_link_libraries(alphaforge_core PUBLIC PostgreSQL::PostgreSQL)
endif()

# Sockets for the HTTP server.
if(WIN32)
    target_link_libraries(alphaforge_core PUBLIC ws2_32)
endif()

# ---------------------------------------------------------------------------
# CLI / server executable
# ---------------------------------------------------------------------------
add_executable(alphaforge apps/cli/main.cpp)
target_link_libraries(alphaforge PRIVATE alphaforge_core)

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
enable_testing()
add_subdirectory(tests)
