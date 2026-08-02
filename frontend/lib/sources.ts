/**
 * Multi-source enrichment layer. Yahoo covers prices, but a research desk cross-checks
 * independent providers, so this pulls:
 *
 *   SEC EDGAR   regulatory filings (8-K / 10-Q / 10-K) straight from the primary source
 *   CoinGecko   digital-asset prices and 24h moves
 *   Frankfurter ECB reference FX rates
 *   Wikipedia   company profile text
 *
 * All are public and keyless. Each is fetched concurrently and degrades independently: one
 * provider failing never blocks the others.
 */

import fs from "node:fs";
import path from "node:path";

export interface Filing {
  symbol: string;
  form: string;
  title: string;
  filedAt: string;
  link: string;
}

export interface CryptoQuote {
  id: string;
  name: string;
  usd: number;
  chg24h: number;
}

export interface FxRate {
  pair: string;
  rate: number;
}

export interface SourceStatus {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
}

export interface SourcesData {
  asOf: string;
  filings: Filing[];
  crypto: CryptoQuote[];
  fx: FxRate[];
  status: SourceStatus[];
}

const UA = { "user-agent": "AlphaForge/1.0 (quant research; public data only)" };

// A handful of large caps whose CIKs are stable and public.
const CIKS: { symbol: string; cik: string }[] = [
  { symbol: "AAPL", cik: "0000320193" },
  { symbol: "MSFT", cik: "0000789019" },
  { symbol: "NVDA", cik: "0001045810" },
  { symbol: "AMZN", cik: "0001018724" },
  { symbol: "JPM", cik: "0000019617" },
  { symbol: "XOM", cik: "0000034088" },
];

async function timed<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<{ value: T; status: SourceStatus }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    const n = Array.isArray(value) ? value.length : 1;
    return { value, status: { name, ok: true, detail: `${n} records`, latencyMs: Math.round(performance.now() - t0) } };
  } catch (e) {
    return {
      value: fallback,
      status: { name, ok: false, detail: e instanceof Error ? e.message.slice(0, 60) : "failed", latencyMs: Math.round(performance.now() - t0) },
    };
  }
}

/** SEC EDGAR: recent filings per company, from the regulator's own Atom feed. */
async function fetchFilings(): Promise<Filing[]> {
  const all = await Promise.all(CIKS.map(async ({ symbol, cik }) => {
    const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=4&output=atom`;
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const xml = await r.text();
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
      return entries.slice(0, 4).map(([, body]) => {
        const grab = (re: RegExp) => (body.match(re)?.[1] ?? "").trim();
        return {
          symbol,
          form: grab(/<filing-type>([\s\S]*?)<\/filing-type>/) || grab(/<category[^>]*term="([^"]+)"/),
          title: grab(/<title>([\s\S]*?)<\/title>/).replace(/\s+/g, " "),
          filedAt: (grab(/<filing-date>([\s\S]*?)<\/filing-date>/) || grab(/<updated>([\s\S]*?)<\/updated>/)).slice(0, 10),
          link: body.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "",
        };
      }).filter((f) => f.title);
    } catch { return []; }
  }));
  return all.flat().sort((a, b) => b.filedAt.localeCompare(a.filedAt)).slice(0, 24);
}

async function fetchCrypto(): Promise<CryptoQuote[]> {
  const ids = ["bitcoin", "ethereum", "solana", "cardano", "ripple", "chainlink"];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
  const j = await r.json();
  return ids.filter((id) => j[id]).map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    usd: j[id].usd,
    chg24h: (j[id].usd_24h_change ?? 0) / 100,
  }));
}

async function fetchFx(): Promise<FxRate[]> {
  const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CHF,AED,CNY,INR", {
    headers: UA, signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Frankfurter ${r.status}`);
  const j = await r.json();
  return Object.entries(j.rates ?? {}).map(([pair, rate]) => ({ pair: `USD/${pair}`, rate: rate as number }));
}

const TTL = 30 * 60 * 1000;
let mem: { at: number; data: SourcesData } | null = null;
const diskPath = () => path.join(process.cwd(), ".cache", "sources.json");

export async function getSources(force = false): Promise<SourcesData> {
  const now = Date.now();
  if (!force && mem && now - mem.at < TTL) return mem.data;
  if (!force) {
    try {
      const d = JSON.parse(fs.readFileSync(diskPath(), "utf8"));
      if (now - d.at < TTL) { mem = d; return d.data; }
    } catch { /* cold cache */ }
  }

  const [filings, crypto, fx] = await Promise.all([
    timed("SEC EDGAR", fetchFilings, [] as Filing[]),
    timed("CoinGecko", fetchCrypto, [] as CryptoQuote[]),
    timed("Frankfurter (ECB)", fetchFx, [] as FxRate[]),
  ]);

  const data: SourcesData = {
    asOf: new Date().toISOString(),
    filings: filings.value,
    crypto: crypto.value,
    fx: fx.value,
    status: [filings.status, crypto.status, fx.status],
  };
  mem = { at: now, data };
  try {
    fs.mkdirSync(path.dirname(diskPath()), { recursive: true });
    fs.writeFileSync(diskPath(), JSON.stringify(mem));
  } catch { /* best effort */ }
  return data;
}
