#include "alphaforge/platform/Json.hpp"

#include "alphaforge/platform/Error.hpp"
#include "framework.hpp"

using alphaforge::Json;

AF_TEST(json_roundtrip_object) {
    const std::string src = R"({"a":1,"b":"hi","c":[1,2,3],"d":true,"e":null})";
    Json j = Json::parse(src);
    CHECK(j["a"].as_number() == 1.0);
    CHECK(j["b"].as_string() == "hi");
    CHECK(j["c"].is_array());
    CHECK(j["c"].items().size() == 3);
    CHECK(j["d"].as_bool() == true);
    CHECK(j["e"].is_null());

    // Reparse the dumped form.
    Json j2 = Json::parse(j.dump());
    CHECK(j2["b"].as_string() == "hi");
}

AF_TEST(json_builds_and_dumps) {
    Json o = Json::object();
    o.set("name", std::string("alpha"));
    o.set("sharpe", 1.25);
    Json arr = Json::array();
    arr.push_back(1);
    arr.push_back(2);
    o.set("vals", arr);
    Json reparsed = Json::parse(o.dump());
    CHECK(reparsed["name"].as_string() == "alpha");
    CHECK_NEAR(reparsed["sharpe"].as_number(), 1.25, 1e-9);
    CHECK(reparsed["vals"].items().size() == 2);
}

AF_TEST(json_malformed_throws) {
    CHECK_THROWS(Json::parse("{not valid"), alphaforge::DataError);
}

AF_TEST(json_missing_key_is_null) {
    Json j = Json::parse(R"({"x":1})");
    CHECK(j["missing"].is_null());
}
