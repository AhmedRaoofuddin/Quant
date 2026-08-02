/**
 * News crawler and finance-sentiment scorer (TypeScript mirror of backend/src/news).
 *
 * Only publicly syndicated RSS/Atom feeds are polled, one request per feed per cycle, with a
 * descriptive User-Agent and a cache. Wire headlines (Reuters, Bloomberg, WSJ and others) appear
 * only where a publisher or aggregator syndicates them publicly, and each item keeps its
 * original source attribution. Commercial terminals are licensed products and are not used.
 */

import fs from "node:fs";
import path from "node:path";
import { UNIVERSE } from "./marketdata";

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  sourceId: string;
  publishedAt: number;
  sentiment: number;
  tickers: string[];
}

export interface TickerSignal {
  symbol: string;
  mentions: number;
  sentiment: number;
  buzz: number;
  latestAt: number;
}

export interface NewsData {
  asOf: string;
  items: NewsItem[];
  signals: TickerSignal[];
  stats: {
    feedsAttempted: number; feedsOk: number; itemsParsed: number; itemsDeduped: number;
    fetchMs: number; parseMs: number; scoreMs: number; totalMs: number; itemsPerSec: number;
  };
}

const SOURCES = [
  { id: "cnbc-top", publisher: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { id: "cnbc-finance", publisher: "CNBC Finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
  { id: "yahoo-finance", publisher: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { id: "marketwatch", publisher: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { id: "nasdaq", publisher: "Nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets" },
  { id: "gnews-markets", publisher: "Google News", url: "https://news.google.com/rss/search?q=stock+market&hl=en-US&gl=US&ceid=US:en" },
  { id: "gnews-earnings", publisher: "Google News", url: "https://news.google.com/rss/search?q=earnings+report&hl=en-US&gl=US&ceid=US:en" },
  { id: "gnews-fed", publisher: "Google News", url: "https://news.google.com/rss/search?q=federal+reserve+interest+rates&hl=en-US&gl=US&ceid=US:en" },
  { id: "gnews-ai", publisher: "Google News", url: "https://news.google.com/rss/search?q=AI+chip+semiconductor+stocks&hl=en-US&gl=US&ceid=US:en" },
];

// Loughran-McDonald style finance lexicon: general sentiment lists misread financial text.
const LEXICON: Record<string, number> = {
  surge: 1, surges: 1, surged: 1, soar: 1, soars: 1, soared: 1, skyrocket: 1, skyrockets: 1,
  record: 0.8, breakthrough: 0.9, outperform: 0.8, outperforms: 0.8, beat: 0.7, beats: 0.7,
  upgrade: 0.8, upgraded: 0.8, upgrades: 0.8, rally: 0.7, rallies: 0.7, rallied: 0.7, bullish: 0.9,
  gain: 0.5, gains: 0.5, gained: 0.5, rise: 0.45, rises: 0.45, rose: 0.45, jump: 0.6, jumps: 0.6,
  jumped: 0.6, climb: 0.5, climbs: 0.5, growth: 0.5, profit: 0.5, profits: 0.5, profitable: 0.6,
  strong: 0.5, stronger: 0.55, boost: 0.5, boosts: 0.5, boosted: 0.5, expand: 0.4, expands: 0.4,
  expansion: 0.4, approve: 0.5, approved: 0.5, win: 0.5, wins: 0.5, won: 0.5, optimism: 0.6,
  optimistic: 0.6, opportunity: 0.4, innovation: 0.4, momentum: 0.4, raises: 0.4, tops: 0.5,
  plunge: -1, plunges: -1, plunged: -1, crash: -1, crashes: -1, collapse: -1, collapses: -1,
  collapsed: -1, bankruptcy: -1, bankrupt: -1, fraud: -1, probe: -0.7, lawsuit: -0.7,
  investigation: -0.7, downgrade: -0.8, downgraded: -0.8, downgrades: -0.8, bearish: -0.9,
  recession: -0.9, default: -0.9, selloff: -0.8, fall: -0.5, falls: -0.5, fell: -0.5, drop: -0.5,
  drops: -0.5, dropped: -0.5, decline: -0.5, declines: -0.5, declined: -0.5, slump: -0.7,
  slumps: -0.7, slumped: -0.7, slide: -0.5, slides: -0.5, loss: -0.6, losses: -0.6, weak: -0.5,
  weaker: -0.55, weakness: -0.55, miss: -0.6, misses: -0.6, missed: -0.6, cut: -0.4, cuts: -0.4,
  layoff: -0.7, layoffs: -0.7, risk: -0.3, risks: -0.3, warning: -0.6, warns: -0.6, warned: -0.6,
  concern: -0.4, concerns: -0.4, struggle: -0.6, struggles: -0.6, struggling: -0.6,
  pressure: -0.4, delay: -0.4, delays: -0.4, delayed: -0.4, halt: -0.6, halts: -0.6,
  tariff: -0.4, tariffs: -0.4, volatile: -0.3, volatility: -0.3, slowdown: -0.6, down: -0.35,
};
const NEGATORS = new Set(["not", "no", "never", "without", "fails", "failed", "fail", "lacks", "unable", "cannot"]);

const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export function scoreSentiment(text: string): number {
  const toks = tokenize(text);
  let total = 0, hits = 0, negate = false;
  for (const t of toks) {
    if (NEGATORS.has(t)) { negate = true; continue; }
    const w = LEXICON[t];
    if (w !== undefined) { total += negate ? -w : w; hits++; negate = false; }
    else if (hits > 0) negate = false;
  }
  if (!hits) return 0;
  const mean = total / hits;
  const coverage = Math.min(1, hits / 3);
  return Math.max(-1, Math.min(1, mean * (0.55 + 0.45 * coverage)));
}

const NAME_BY_SYMBOL: Record<string, string> = Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.name]));
const ALIASES: Record<string, string> = {};
for (const u of UNIVERSE) {
  const key = u.name.toLowerCase();
  ALIASES[key] = u.symbol;
  const head = key.split(" ")[0];
  if (head.length >= 3) ALIASES[head] = u.symbol;
}

// Tickers that collide with ordinary English words, so a bare lowercase match is meaningless.
const AMBIGUOUS = new Set(["NOW", "T", "C", "V", "MU", "ALL", "KEY", "ON", "IT", "SO", "A", "GE", "MA", "HD", "DE"]);

export function matchTickers(text: string): string[] {
  const found = new Set<string>();

  // Company names match case-insensitively ("Nvidia", "nvidia" -> NVDA).
  for (const tok of tokenize(text)) {
    const alias = ALIASES[tok];
    if (alias) found.add(alias);
  }

  // Bare tickers must appear UPPERCASE in the source text, otherwise "now" would tag
  // ServiceNow and "it" would tag every headline. Ambiguous symbols additionally require
  // a cashtag ($NOW) or an adjacent market word.
  const upperTokens = text.match(/\b[A-Z]{1,5}\b/g) ?? [];
  for (const up of upperTokens) {
    if (!NAME_BY_SYMBOL[up]) continue;
    if (AMBIGUOUS.has(up)) {
      const cashtag = new RegExp(`\\$${up}\\b`).test(text);
      const qualified = new RegExp(`\\b${up}\\b\\s+(stock|shares|earnings|beats|misses|falls|rises|jumps|drops)`, "i").test(text);
      if (!cashtag && !qualified) continue;
    }
    found.add(up);
  }
  return [...found];
}

function decode(raw: string): string {
  let s = raw;
  const cd = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cd) s = cd[1];
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&(amp|lt|gt|quot|apos|#39|#34|nbsp);/g, (_, e) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#34": '"', nbsp: " " } as Record<string, string>)[e] ?? " ");
  return s.replace(/\s+/g, " ").trim();
}

function parseFeed(xml: string, source: { id: string; publisher: string }): NewsItem[] {
  const isAtom = xml.includes("<entry") && !xml.includes("<item");
  const blocks = isAtom
    ? [...xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)]
    : [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)];
  const out: NewsItem[] = [];
  for (const [, body] of blocks) {
    const grab = (re: RegExp) => { const m = body.match(re); return m ? decode(m[1]) : ""; };
    const title = grab(/<title[^>]*>([\s\S]*?)<\/title>/);
    if (!title) continue;
    const link = isAtom
      ? (body.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "")
      : grab(/<link[^>]*>([\s\S]*?)<\/link>/);
    const dateRaw = grab(/<pubDate>([\s\S]*?)<\/pubDate>/) || grab(/<updated>([\s\S]*?)<\/updated>/) || grab(/<published>([\s\S]*?)<\/published>/);
    const parsed = dateRaw ? Date.parse(dateRaw) : NaN;
    out.push({
      title, link,
      publisher: grab(/<source[^>]*>([\s\S]*?)<\/source>/) || source.publisher,
      sourceId: source.id,
      publishedAt: Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000),
      sentiment: 0, tickers: [],
    });
  }
  return out;
}

const TTL = 10 * 60 * 1000;
let mem: { at: number; data: NewsData } | null = null;
const diskPath = () => path.join(process.cwd(), ".cache", "news.json");

export async function getNews(force = false): Promise<NewsData> {
  const now = Date.now();
  if (!force && mem && now - mem.at < TTL) return mem.data;
  if (!force) {
    try {
      const d = JSON.parse(fs.readFileSync(diskPath(), "utf8"));
      if (now - d.at < TTL) { mem = d; return d.data; }
    } catch { /* cold cache */ }
  }

  const t0 = performance.now();
  // Concurrent fetch: total latency is the slowest feed, not the sum.
  const bodies = await Promise.all(SOURCES.map(async (s) => {
    try {
      const r = await fetch(s.url, {
        headers: { "user-agent": "AlphaForge/1.0 (quant research; syndicated RSS only)" },
        signal: AbortSignal.timeout(12000),
      });
      return r.ok ? await r.text() : "";
    } catch { return ""; }
  }));
  const fetchMs = performance.now() - t0;

  const t1 = performance.now();
  const parsed: NewsItem[] = [];
  let feedsOk = 0;
  bodies.forEach((body, i) => {
    if (!body) return;
    feedsOk++;
    parsed.push(...parseFeed(body, SOURCES[i]));
  });
  const parseMs = performance.now() - t1;

  const t2 = performance.now();
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const it of parsed) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 96);
    if (seen.has(key)) continue;
    seen.add(key);
    it.sentiment = scoreSentiment(it.title);
    it.tickers = matchTickers(it.title);
    items.push(it);
  }
  items.sort((a, b) => b.publishedAt - a.publishedAt);
  const scoreMs = performance.now() - t2;

  // Aggregate per-ticker signals.
  const acc = new Map<string, TickerSignal>();
  for (const it of items) {
    for (const sym of it.tickers) {
      const s = acc.get(sym) ?? { symbol: sym, mentions: 0, sentiment: 0, buzz: 0, latestAt: 0 };
      s.mentions++; s.sentiment += it.sentiment; s.latestAt = Math.max(s.latestAt, it.publishedAt);
      acc.set(sym, s);
    }
  }
  const signals = [...acc.values()].map((s) => ({ ...s, sentiment: s.sentiment / s.mentions }));
  const avg = signals.length ? signals.reduce((a, s) => a + s.mentions, 0) / signals.length : 1;
  signals.forEach((s) => { s.buzz = avg > 0 ? s.mentions / avg : 0; });
  signals.sort((a, b) => b.mentions - a.mentions);

  const totalMs = performance.now() - t0;
  const data: NewsData = {
    asOf: new Date().toISOString(),
    items: items.slice(0, 120),
    signals,
    stats: {
      feedsAttempted: SOURCES.length, feedsOk, itemsParsed: parsed.length,
      itemsDeduped: parsed.length - items.length,
      fetchMs: +fetchMs.toFixed(1), parseMs: +parseMs.toFixed(1), scoreMs: +scoreMs.toFixed(1),
      totalMs: +totalMs.toFixed(1),
      itemsPerSec: +(parsed.length / (totalMs / 1000)).toFixed(0),
    },
  };

  mem = { at: now, data };
  try {
    fs.mkdirSync(path.dirname(diskPath()), { recursive: true });
    fs.writeFileSync(diskPath(), JSON.stringify(mem));
  } catch { /* best effort */ }
  return data;
}
