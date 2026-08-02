#!/usr/bin/env python3
"""
Fetch company logos from Wikidata for the product video.

Entities are resolved by searching for the company's name and rejecting any hit whose label does
not match, never by hand-typed Q-ids. Hand-typing is how an earlier version of this script
downloaded Stanford University's wordmark for Oracle and a French commune for Mastercard: a wrong
Q-id fails silently and produces a confidently wrong logo.

The logo itself is P154, a file on Wikimedia Commons. Entities often hold several, including
historical marks, so the claim is chosen by rank and recency rather than document order. Most are
SVG, which PIL cannot rasterise, so Commons renders a PNG thumbnail via Special:FilePath.

Output: media/logos/<TICKER>.png   plus  media/logos/manifest.json recording provenance.
"""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "logos")
os.makedirs(OUT, exist_ok=True)

UA = "AlphaForge-media/1.0 (portfolio research project; https://github.com/AhmedRaoofuddin/Quant)"

# Ticker -> the company's exact Wikidata English label. Entities are found by searching for this
# name, and the result is rejected unless its label matches, so a bad hit cannot slip through.
#
# The Wikidata Query Service (SPARQL on P249 ticker symbol) would be the cleaner resolver, but it
# has been returning "aggressively rate-limiting to 1 req/min - active wdqs outage". The search
# API is unaffected, and label verification gives the same guarantee.
COMPANIES = {
    "AAPL": "Apple Inc.",          "MSFT": "Microsoft",
    "NVDA": "Nvidia",              "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon",              "META": "Meta Platforms",
    "TSLA": "Tesla, Inc.",         "JPM": "JPMorgan Chase",
    "GS": "Goldman Sachs",         "MS": "Morgan Stanley",
    "V": "Visa Inc.",              "MA": "Mastercard",
    "JNJ": "Johnson & Johnson",    "PFE": "Pfizer",
    "MRK": "Merck & Co.",          "XOM": "ExxonMobil",
    "CVX": "Chevron Corporation",  "WMT": "Walmart",
    "KO": "The Coca-Cola Company", "MCD": "McDonald's",
    "NKE": "Nike, Inc.",           "CAT": "Caterpillar Inc.",
    "BA": "Boeing",                "GE": "General Electric",
    "DIS": "The Walt Disney Company", "NFLX": "Netflix",
    "INTC": "Intel",               "AMD": "AMD",
    "IBM": "IBM",                  "ORCL": "Oracle Corporation",
    "ADBE": "Adobe Inc.",          "TSM": "TSMC",
}


def fetch(url, timeout=60, accept=None):
    """GET with exponential backoff on 429, so throttling never masquerades as missing data."""
    headers = {"User-Agent": UA}
    if accept:
        headers["Accept"] = accept
    delay = 5.0
    for attempt in range(5):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers=headers), timeout=timeout
            ) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def norm(s):
    """Compare labels ignoring case, punctuation and corporate suffixes."""
    words = re.findall(r"[a-z0-9]+", s.lower())
    stop = {"inc", "corporation", "corp", "company", "the", "co", "plc", "ltd", "platforms"}
    return " ".join(w for w in words if w not in stop)


def search_entity(name):
    """First Wikidata entity whose label matches `name`. Returns (qid, label) or None."""
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "wbsearchentities", "search": name, "language": "en",
         "type": "item", "limit": 8, "format": "json"}
    )
    for hit in json.loads(fetch(url, timeout=30).decode("utf-8")).get("search", []):
        label = hit.get("label", "")
        if norm(label) == norm(name):
            return hit["id"], label
    return None


def logo_file(qid):
    """
    Current P154 logo filename for an entity, or None if it genuinely has no logo.

    Entities often carry several logos, including historical ones qualified with an end time.
    Taking the first claim is how this script initially picked Microsoft's 1980 wordmark and
    Intel's 1968 mark. Preference order: statement rank, then no end-time qualifier (still in
    use), then the latest start time.
    """
    url = ("https://www.wikidata.org/w/api.php?action=wbgetclaims"
           f"&entity={qid}&property=P154&format=json")
    claims = json.loads(fetch(url, timeout=30).decode("utf-8")).get("claims", {}).get("P154", [])

    RANK = {"preferred": 2, "normal": 1, "deprecated": 0}
    scored = []
    for c in claims:
        try:
            fname = c["mainsnak"]["datavalue"]["value"]
        except (KeyError, TypeError):
            continue
        quals = c.get("qualifiers", {})
        superseded = "P582" in quals                     # P582 = end time: no longer in use
        start = ""
        if "P580" in quals:                              # P580 = start time
            try:
                start = quals["P580"][0]["datavalue"]["value"]["time"]
            except (KeyError, TypeError, IndexError):
                start = ""
        scored.append((RANK.get(c.get("rank"), 1), 0 if superseded else 1, start, fname))

    if not scored:
        return None
    scored.sort(reverse=True)
    return scored[0][3]


def resolve():
    """Ticker -> {qid, label, file}, each verified to be the company we asked for."""
    found = {}
    for ticker, name in COMPANIES.items():
        hit = search_entity(name)
        time.sleep(1.2)
        if not hit:
            print(f"{ticker:6} no entity whose label matches {name!r}")
            continue
        qid, label = hit
        fname = logo_file(qid)
        time.sleep(1.2)
        if not fname:
            print(f"{ticker:6} {qid:11} {label[:28]:30} no P154 logo on Wikidata")
            continue
        found[ticker] = {"qid": qid, "label": label, "file": fname}
    return found


def download(filename, dest):
    """Commons renders SVG to PNG when a width is requested via Special:FilePath."""
    quoted = urllib.parse.quote(filename.replace(" ", "_"))
    data = fetch(f"https://commons.wikimedia.org/wiki/Special:FilePath/{quoted}?width=360")
    if len(data) < 200:
        raise ValueError(f"suspiciously small ({len(data)} bytes)")
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


def main():
    print("resolving companies through the Wikidata search API, verifying each label...\n")
    found = resolve()
    missing = [t for t in COMPANIES if t not in found]
    print(f"\nresolved {len(found)}/{len(COMPANIES)}\n")

    manifest, ok, failed = [], [], []
    for ticker in COMPANIES:
        if ticker not in found:
            continue
        info = found[ticker]
        dest = os.path.join(OUT, f"{ticker}.png")
        try:
            size = download(info["file"], dest)
        except Exception as e:
            print(f"{ticker:6} {info['label'][:26]:28} download failed: {e}")
            failed.append(ticker)
            continue
        print(f"{ticker:6} {info['qid']:11} {info['label'][:26]:28} {info['file'][:38]:40} {size:>7}b")
        manifest.append({**info, "ticker": ticker, "bytes": size,
                         "source": f"https://commons.wikimedia.org/wiki/File:{info['file']}"})
        ok.append(ticker)
        time.sleep(1.2)

    # Remove stale files for tickers that no longer resolve, so nothing wrong survives a rerun.
    keep = {f"{t}.png" for t in ok}
    for f in os.listdir(OUT):
        if f.endswith(".png") and f not in keep:
            os.remove(os.path.join(OUT, f))
            print(f"removed stale {f}")

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\ndownloaded {len(ok)}  failed {len(failed)}  unresolved {len(missing)}")
    if missing:
        print("no business entity with that ticker + P154 logo: " + " ".join(missing))
    if failed:
        print("download failures: " + " ".join(failed))


if __name__ == "__main__":
    main()
