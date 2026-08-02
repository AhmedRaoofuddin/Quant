"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsData } from "@/lib/news";
import { fmtNumber, fmtPercent } from "@/lib/format";
import { Panel, MetricBar, Readout, SectionHead } from "@/components/Panel";
import { CompanyLogo } from "@/components/CompanyLogo";

function ago(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() / 1000 - ts) / 60);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NewsDesk() {
  const [data, setData] = useState<NewsData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tone, setTone] = useState<"all" | "pos" | "neg">("all");
  const [publisher, setPublisher] = useState<string>("");
  const [ticker, setTicker] = useState<string>("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/news").then((r) => r.json()).then((d) => {
      if (d.error) throw new Error(d.error);
      setData(d); setState("ready");
    }).catch(() => setState("error"));
  }, []);

  const publishers = useMemo(() => {
    if (!data) return [];
    const c = new Map<string, number>();
    data.items.forEach((i) => c.set(i.publisher, (c.get(i.publisher) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [data]);

  const items = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((i) =>
      (tone === "all" || (tone === "pos" ? i.sentiment > 0.1 : i.sentiment < -0.1)) &&
      (!publisher || i.publisher === publisher) &&
      (!ticker || i.tickers.includes(ticker)) &&
      (!q || i.title.toLowerCase().includes(q)));
  }, [data, tone, publisher, ticker, query]);

  if (state === "loading") return <div className="space-y-4"><div className="skeleton h-16" /><div className="skeleton h-96" /></div>;
  if (state === "error" || !data) return <Panel title="News"><p className="text-[13px] text-down">Could not load news feeds. Retry shortly.</p></Panel>;

  const s = data.stats;
  const netTone = data.items.length ? data.items.reduce((a, i) => a + i.sentiment, 0) / data.items.length : 0;

  return (
    <div className="space-y-3">
      <SectionHead
        title="News Desk"
        sub={`${s.feedsOk}/${s.feedsAttempted} syndicated feeds · ${s.itemsParsed} headlines parsed · as of ${data.asOf.slice(11, 16)} UTC`}
        right={<span className="flex items-center gap-2 text-[12px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-up blink" />live crawl</span>}
      />

      <MetricBar>
        <Readout label="Headlines" value={String(s.itemsParsed)} sub={`${s.itemsDeduped} duplicates removed`} />
        <Readout label="Net tone" value={fmtNumber(netTone, 2)} tone={netTone >= 0 ? "pos" : "neg"} sub="corpus sentiment" />
        <Readout label="Tickers tagged" value={String(data.signals.length)} sub="entity matches" />
        <Readout label="Crawl latency" value={`${Math.round(s.totalMs)}ms`} sub={`fetch ${Math.round(s.fetchMs)}ms concurrent`} />
        <Readout label="Parse + score" value={`${Math.round(s.parseMs + s.scoreMs)}ms`} sub={`${s.itemsPerSec} items/s`} />
        <Readout label="Sources" value={String(publishers.length)} sub="publishers" />
      </MetricBar>

      {/* filters */}
      <div className="card flex flex-wrap items-center gap-2">
        {(["all", "pos", "neg"] as const).map((t) => (
          <button key={t} onClick={() => setTone(t)} data-on={tone === t} className="chip">
            {t === "all" ? "All tone" : t === "pos" ? "Bullish" : "Bearish"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {publishers.slice(0, 6).map(([p, n]) => (
          <button key={p} onClick={() => setPublisher(publisher === p ? "" : p)} data-on={publisher === p} className="chip">
            {p} <span className="text-faint">{n}</span>
          </button>
        ))}
        {ticker && <button onClick={() => setTicker("")} data-on className="chip">{ticker} ✕</button>}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search headlines" className="input-field ml-auto w-48" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.618fr_1fr]">
        {/* headline feed */}
        <Panel title="Headlines" bodyClass="p-0" right={`${items.length} shown`}>
          <div className="max-h-[620px] overflow-y-auto">
            {items.length === 0 && <div className="grid h-32 place-items-center text-[12px] text-muted">No headlines match these filters.</div>}
            {items.map((i, k) => (
              <a key={`${i.link}-${k}`} href={i.link} target="_blank" rel="noopener noreferrer"
                className="block border-b border-line/60 px-4 py-3 transition-colors last:border-0 hover:bg-accent/5">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.sentiment > 0.1 ? "bg-up" : i.sentiment < -0.1 ? "bg-down" : "bg-line-strong"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug text-text">{i.title}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="eyebrow">{i.publisher}</span>
                      {i.publishedAt > 0 && <span className="text-[11px] text-faint">{ago(i.publishedAt)} ago</span>}
                      {i.sentiment !== 0 && (
                        <span className={`mono text-[10.5px] ${i.sentiment > 0 ? "up" : "down"}`}>
                          {i.sentiment > 0 ? "+" : ""}{i.sentiment.toFixed(2)}
                        </span>
                      )}
                      {i.tickers.slice(0, 4).map((t) => (
                        <button key={t} onClick={(e) => { e.preventDefault(); setTicker(t); }}
                          className="rounded-[2px] border border-line-strong px-1.5 py-px mono text-[10px] text-muted hover:border-accent hover:text-accent">
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </Panel>

        {/* ticker signals */}
        <Panel title="Ticker signals" bodyClass="p-0" right="mentions · tone · buzz">
          <div className="max-h-[620px] overflow-y-auto">
            {data.signals.map((sig) => {
              const w = Math.min(100, (sig.sentiment + 1) * 50);
              return (
                <button key={sig.symbol} onClick={() => setTicker(ticker === sig.symbol ? "" : sig.symbol)}
                  className={`flex w-full items-center gap-3 border-b border-line/60 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/5 ${ticker === sig.symbol ? "bg-accent/5" : ""}`}>
                  <CompanyLogo symbol={sig.symbol} size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="mono text-[12.5px] font-semibold text-text">{sig.symbol}</span>
                      <span className={`mono text-[11.5px] ${sig.sentiment >= 0 ? "up" : "down"}`}>{sig.sentiment >= 0 ? "+" : ""}{sig.sentiment.toFixed(2)}</span>
                    </div>
                    {/* tone bar: centre is neutral */}
                    <div className="relative mt-1.5 h-1 w-full rounded-full bg-bg">
                      <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                      <span className={`absolute inset-y-0 rounded-full ${sig.sentiment >= 0 ? "bg-up" : "bg-down"}`}
                        style={sig.sentiment >= 0 ? { left: "50%", width: `${w - 50}%` } : { right: `${100 - w}%`, left: `${w}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[10.5px] text-faint">
                      <span>{sig.mentions} mentions</span>
                      <span>buzz {fmtNumber(sig.buzz, 1)}×</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <p className="text-[11px] leading-relaxed text-faint">
        Sources are publicly syndicated RSS/Atom feeds, polled once per cycle with a descriptive
        user-agent and cached. Wire headlines appear only where a publisher or aggregator syndicates
        them publicly, and each item keeps its original attribution and links back to the source.
        Sentiment uses a Loughran-McDonald style finance lexicon with negation handling, not a
        general-purpose model. Coverage is a signal, not investment advice.
      </p>
    </div>
  );
}
