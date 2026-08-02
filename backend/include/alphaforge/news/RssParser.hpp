#pragma once
///
/// \file RssParser.hpp
/// \brief A single-pass, allocation-light RSS/Atom parser.
///
/// Feeds are small but numerous, so the parser avoids a general XML DOM: it scans the document
/// once with string_view cursors, extracting only the fields we need. That keeps a full crawl in
/// the low milliseconds even across dozens of feeds.
///
#include <string>
#include <string_view>
#include <vector>

#include "alphaforge/news/Feed.hpp"

namespace alphaforge::news {

class RssParser {
public:
    /// Parse an RSS 2.0 or Atom document. `source` supplies attribution defaults.
    [[nodiscard]] static std::vector<NewsItem> parse(std::string_view xml, const FeedSource& source);

    /// Decode XML entities and strip CDATA wrappers / tags from a text node.
    [[nodiscard]] static std::string clean_text(std::string_view raw);

    /// Parse RFC-822 (RSS) or ISO-8601 (Atom) timestamps to unix seconds; 0 if unparseable.
    [[nodiscard]] static std::int64_t parse_date(std::string_view raw);
};

}  // namespace alphaforge::news
