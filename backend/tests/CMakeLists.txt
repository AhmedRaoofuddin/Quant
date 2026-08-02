# Self-contained test suite (no external framework dependency).
file(GLOB TEST_SOURCES CONFIGURE_DEPENDS "test_*.cpp")

add_executable(alphaforge_tests ${TEST_SOURCES})
target_include_directories(alphaforge_tests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(alphaforge_tests PRIVATE alphaforge_core)

add_test(NAME unit COMMAND alphaforge_tests)
