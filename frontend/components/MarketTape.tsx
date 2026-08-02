"use client";

import { useEffect, useRef, useState } from "react";

// A live simulated market tape: a continuously scrolling ticker whose prices random-walk and flash
// green/red on each tick. Purely a liveness layer (labeled SIM), it makes the terminal feel alive.

const SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "JPM", "V", "JNJ", "WMT", "PG", "XOM", "HD", "BAC"];

interface Tick { sym: string; px: number; chg: number; dir: 0 | 1 | -1 }

export function MarketTape() {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const prices = useRef<number[]>([]);

  useEffect(() => {
    prices.current = SYMBOLS.map(() => 40 + Math.random() * 360);
    const seed = () => SYMBOLS.map((sym, i) => ({ sym, px: prices.current[i], chg: 0, dir: 0 as const }));
    setTicks(seed());

    const id = setInterval(() => {
      setTicks(
        SYMBOLS.map((sym, i) => {
          const prev = prices.current[i];
          const drift = (Math.random() - 0.5) * 0.006;
          const next = Math.max(1, prev * (1 + drift));
          prices.current[i] = next;
          const chg = (next - prev) / prev;
          return { sym, px: next, chg, dir: chg > 0 ? 1 : chg < 0 ? -1 : 0 };
        }),
      );
    }, 900);
    return () => clearInterval(id);
  }, []);

  const row = [...ticks, ...ticks]; // duplicate for seamless scroll

  return (
    <div className="panel relative flex h-8 items-center overflow-hidden">
      <div className="z-10 flex h-full shrink-0 items-center gap-1.5 border-r border-line bg-header px-3">
        <span className="h-1.5 w-1.5 rounded-full bg-green blink" />
        <span className="mono text-[10px] font-semibold tracking-wide text-muted">LIVE SIM</span>
      </div>
      <div className="marquee flex items-center whitespace-nowrap">
        {row.map((t, i) => (
          <span key={i} className="mono flex items-center gap-1.5 px-4 text-[11px]">
            <span className="font-semibold text-text">{t.sym}</span>
            <span className={t.dir === 1 ? "pos" : t.dir === -1 ? "neg" : "text-muted"}>{t.px.toFixed(2)}</span>
            <span className={`text-[10px] ${t.dir === 1 ? "pos" : t.dir === -1 ? "neg" : "text-faint"}`}>
              {t.dir === 1 ? "▲" : t.dir === -1 ? "▼" : "·"}{Math.abs(t.chg * 100).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
