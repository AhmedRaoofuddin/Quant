#include "alphaforge/news/RssParser.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <ctime>
#include <unordered_map>

namespace alphaforge::news {

namespace {

/// Find the text between <tag ...> and </tag>, starting at `from`. Returns npos-safe views.
std::string_view extract(std::string_view doc, std::string_view tag, std::size_t from,
                         std::size_t until, std::size_t* end_out = nullptr) {
    // Match "<tag>" or "<tag att=...>" but not "<tagother>".
    std::size_t pos = from;
    while (pos < until) {
        pos = doc.find('<', pos);
        if (pos == std::string_view::npos || pos >= until) return {};
        const std::size_t name_start = pos + 1;
        if (doc.compare(name_start, tag.size(), tag) != 0) { pos = name_start; continue; }
        const char after = name_start + tag.size() < doc.size() ? doc[name_start + tag.size()] : '\0';
        if (after != '>' && after != ' ' && after != '\t' && after != '\n' && after != '/') { pos = name_start; continue; }
        const std::size_t gt = doc.find('>', name_start);
        if (gt == std::string_view::npos || gt >= until) return {};
        if (doc[gt - 1] == '/') { pos = gt + 1; continue; }  // self-closing, no text
        const std::size_t close = doc.find("</", gt + 1);
        if (close == std::string_view::npos || close > until) return {};
        if (end_out) *end_out = close;
        return doc.substr(gt + 1, close - gt - 1);
    }
    return {};
}

/// Atom links carry the URL in an href attribute rather than as text.
std::string_view extract_atom_link(std::string_view doc, std::size_t from, std::size_t until) {
    std::size_t pos = doc.find("<link", from);
    if (pos == std::string_view::npos || pos >= until) return {};
    const std::size_t href = doc.find("href=\"", pos);
    if (href == std::string_view::npos || href >= until) return {};
    const std::size_t start = href + 6;
    const std::size_t end = doc.find('"', start);
    if (end == std::string_view::npos || end > until) return {};
    return doc.substr(start, end - start);
}

const std::unordered_map<std::string, char>& entities() {
    static const std::unordered_map<std::string, char> map = {
        {"amp", '&'}, {"lt", '<'}, {"gt", '>'}, {"quot", '"'}, {"apos", '\''}, {"#39", '\''},
        {"#34", '"'}, {"nbsp", ' '},
    };
    return map;
}

int month_from_abbr(std::string_view m) {
    static constexpr std::array<const char*, 12> names = {
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
    for (int i = 0; i < 12; ++i) if (m.compare(0, 3, names[i]) == 0) return i;
    return -1;
}

/// Days from civil date (Howard Hinnant's algorithm) -> unix epoch days.
std::int64_t days_from_civil(int y, int m, int d) {
    y -= m <= 2;
    const std::int64_t era = (y >= 0 ? y : y - 399) / 400;
    const unsigned yoe = static_cast<unsigned>(y - era * 400);
    const unsigned doy = static_cast<unsigned>((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1);
    const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + static_cast<std::int64_t>(doe) - 719468;
}

}  // namespace

std::string RssParser::clean_text(std::string_view raw) {
    // Strip a CDATA wrapper.
    if (raw.size() > 12) {
        const std::size_t cd = raw.find("<![CDATA[");
        if (cd != std::string_view::npos) {
            const std::size_t end = raw.find("]]>", cd);
            if (end != std::string_view::npos) raw = raw.substr(cd + 9, end - cd - 9);
        }
    }

    std::string out;
    out.reserve(raw.size());
    bool in_tag = false;
    for (std::size_t i = 0; i < raw.size(); ++i) {
        const char c = raw[i];
        if (c == '<') { in_tag = true; continue; }
        if (c == '>') { in_tag = false; continue; }
        if (in_tag) continue;
        if (c == '&') {
            const std::size_t semi = raw.find(';', i);
            if (semi != std::string_view::npos && semi - i <= 8) {
                const std::string name(raw.substr(i + 1, semi - i - 1));
                const auto it = entities().find(name);
                if (it != entities().end()) { out += it->second; i = semi; continue; }
            }
        }
        out += c;
    }

    // Collapse whitespace and trim.
    std::string collapsed;
    collapsed.reserve(out.size());
    bool prev_space = false;
    for (char c : out) {
        const bool sp = std::isspace(static_cast<unsigned char>(c)) != 0;
        if (sp) { if (!prev_space && !collapsed.empty()) collapsed += ' '; }
        else collapsed += c;
        prev_space = sp;
    }
    while (!collapsed.empty() && collapsed.back() == ' ') collapsed.pop_back();
    return collapsed;
}

std::int64_t RssParser::parse_date(std::string_view raw) {
    if (raw.empty()) return 0;
    int y = 0, mo = -1, d = 0, h = 0, mi = 0, s = 0;

    // ISO-8601: 2026-08-02T11:22:33Z
    if (raw.size() >= 19 && raw[4] == '-' && raw[7] == '-') {
        y = std::atoi(std::string(raw.substr(0, 4)).c_str());
        mo = std::atoi(std::string(raw.substr(5, 2)).c_str()) - 1;
        d = std::atoi(std::string(raw.substr(8, 2)).c_str());
        h = std::atoi(std::string(raw.substr(11, 2)).c_str());
        mi = std::atoi(std::string(raw.substr(14, 2)).c_str());
        s = std::atoi(std::string(raw.substr(17, 2)).c_str());
    } else {
        // RFC-822: Mon, 27 Jul 2026 20:21:00 GMT
        const std::size_t comma = raw.find(',');
        std::string_view rest = comma == std::string_view::npos ? raw : raw.substr(comma + 1);
        while (!rest.empty() && rest.front() == ' ') rest.remove_prefix(1);
        if (rest.size() < 20) return 0;
        d = std::atoi(std::string(rest.substr(0, 2)).c_str());
        mo = month_from_abbr(rest.substr(3, 3));
        y = std::atoi(std::string(rest.substr(7, 4)).c_str());
        h = std::atoi(std::string(rest.substr(12, 2)).c_str());
        mi = std::atoi(std::string(rest.substr(15, 2)).c_str());
        s = std::atoi(std::string(rest.substr(18, 2)).c_str());
    }
    if (mo < 0 || mo > 11 || y < 1970) return 0;
    return days_from_civil(y, mo + 1, d) * 86400 + h * 3600 + mi * 60 + s;
}

std::vector<NewsItem> RssParser::parse(std::string_view xml, const FeedSource& source) {
    std::vector<NewsItem> items;
    items.reserve(48);

    const bool atom = xml.find("<entry") != std::string_view::npos &&
                      xml.find("<item") == std::string_view::npos;
    const std::string_view open = atom ? "<entry" : "<item";
    const std::string_view close = atom ? "</entry>" : "</item>";

    std::size_t pos = 0;
    while (true) {
        const std::size_t start = xml.find(open, pos);
        if (start == std::string_view::npos) break;
        const std::size_t end = xml.find(close, start);
        if (end == std::string_view::npos) break;

        NewsItem item;
        item.source_id = source.id;
        item.publisher = source.publisher;
        item.title = clean_text(extract(xml, "title", start, end));

        if (atom) {
            item.link = clean_text(extract_atom_link(xml, start, end));
            item.published_at = parse_date(clean_text(extract(xml, "updated", start, end)));
            if (item.published_at == 0)
                item.published_at = parse_date(clean_text(extract(xml, "published", start, end)));
        } else {
            item.link = clean_text(extract(xml, "link", start, end));
            item.published_at = parse_date(clean_text(extract(xml, "pubDate", start, end)));
            // Aggregators (e.g. Google News) name the true publisher in <source>.
            const std::string src = clean_text(extract(xml, "source", start, end));
            if (!src.empty()) item.publisher = src;
        }

        if (!item.title.empty()) items.push_back(std::move(item));
        pos = end + close.size();
    }
    return items;
}

}  // namespace alphaforge::news
