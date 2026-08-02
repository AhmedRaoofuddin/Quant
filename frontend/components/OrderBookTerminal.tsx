"use client";

import { useEffect, useRef, useState } from "react";
import { Simulation } from "@/lib/obsim";
import { BookSnapshot, TICK_SIZE, Trade } from "@/lib/orderbook";
import type { MMState } from "@/lib/obsim";
import { Panel, Readout } from "@/components/Panel";

const px = (tick: number) => (tick * TICK_SIZE).toFixed(2);

interface Snap {
  book: BookSnapshot;
  mm: MMState;
  mid: number[]; micro: number[]; imb: number[]; pnl: number[];
  trades: Trade[];
  steps: number; orders: number; tradesCount: number; volume: number; ops: number;
}

export function OrderBookTerminal() {
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(6); // sim steps per animation frame
  const [s, setS] = useState<Snap | null>(null);
  const sim = useRef<Simulation | null>(null);
  const perf = useRef({ lastT: 0, lastOrders: 0, ops: 0 });

  useEffect(() => {
    sim.current = new Simulation(0xC0FFEE, 10000);
    perf.current.lastT = performance.now();
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      const S = sim.current;
      if (S) {
        for (let i = 0; i < speed; i++) S.step();
        const now = performance.now();
        const p = perf.current;
        if (now - p.lastT > 400) {
          p.ops = Math.round(((S.book.ordersProcessed - p.lastOrders) * 1000) / (now - p.lastT));
          p.lastT = now; p.lastOrders = S.book.ordersProcessed;
        }
        const book = S.book.snapshot(13);
        setS({
          book,
          mm: S.mm.state(S.book.midTick()),
          mid: S.history.mid.slice(), micro: S.history.micro.slice(), imb: S.history.imbalance.slice(), pnl: S.history.pnl.slice(),
          trades: S.book.recentTrades.slice(0, 22),
          steps: S.steps, orders: S.book.ordersProcessed, tradesCount: S.book.tradesCount, volume: S.book.volume, ops: p.ops,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);

  if (!s) return <div className="skeleton h-96 rounded" />;

  return (
    <div className="space-y-2.5">
      {/* status strip */}
      <div className="panel flex flex-wrap items-center justify-between">
        <div className="flex flex-wrap">
          <Readout label="Last" value={s.book.lastTrade ? px(s.book.lastTrade.tick) : "—"} tone={s.book.lastTrade?.aggressor === "buy" ? "pos" : "neg"} sub="print" />
          <Readout label="Mid" value={s.book.mid ? px(s.book.mid) : "—"} sub="bid-ask" />
          <Readout label="Microprice" value={s.book.microprice ? px(s.book.microprice) : "—"} tone={s.book.microprice && s.book.mid && s.book.microprice > s.book.mid ? "pos" : "neg"} sub="size-weighted" />
          <Readout label="Spread" value={s.book.spreadTicks !== null ? `${s.book.spreadTicks}t` : "—"} sub={`${TICK_SIZE.toFixed(2)}/tick`} />
          <Readout label="Imbalance" value={`${(s.imb.at(-1) ?? 0) >= 0 ? "+" : ""}${((s.imb.at(-1) ?? 0) * 100).toFixed(0)}%`} tone={(s.imb.at(-1) ?? 0) >= 0 ? "pos" : "neg"} sub="L2 depth" />
          <Readout label="Throughput" value={s.ops.toLocaleString()} sub="orders/s" />
          <Readout label="Trades" value={s.tradesCount.toLocaleString()} sub={`${(s.volume / 1000).toFixed(1)}k vol`} />
        </div>
        <div className="flex items-center gap-2 px-3">
          <span className="mono text-[10px] text-faint">SPEED</span>
          <input type="range" min={1} max={24} value={speed} onChange={(e) => setSpeed(+e.target.value)} className="h-1 w-20 accent-blue" />
          <button onClick={() => setRunning((r) => !r)} className="rounded-sm border border-line px-3 py-1 mono text-[11px] uppercase text-muted transition hover:bg-panel hover:text-text">
            {running ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-12">
        {/* Depth ladder */}
        <div className="xl:col-span-4">
          <Panel title="Order book" accent="blue" bodyClass="p-0" right="price-time priority">
            <DepthLadder book={s.book} mm={s.mm} />
          </Panel>
        </div>

        {/* Mid chart + depth chart */}
        <div className="flex flex-col gap-2.5 xl:col-span-5">
          <Panel title="Microprice" accent="green" right="streaming">
            <MidChart mid={s.mid} micro={s.micro} />
          </Panel>
          <Panel title="Depth profile" accent="cyan" right="cumulative L2">
            <DepthChart book={s.book} />
          </Panel>
        </div>

        {/* Tape + imbalance + MM */}
        <div className="flex flex-col gap-2.5 xl:col-span-3">
          <Panel title="Time & sales" accent="amber" bodyClass="p-0" right="tape">
            <Tape trades={s.trades} />
          </Panel>
          <Panel title="Order-flow imbalance" accent="blue">
            <ImbalanceGauge value={s.imb.at(-1) ?? 0} hist={s.imb} />
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        <Panel title="Market maker" accent="green" className="lg:col-span-2" right="inventory-skewed quoting">
          <MMView mm={s.mm} pnl={s.pnl} />
        </Panel>
        <Panel title="Engine" accent="cyan">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px]">
            <Stat k="Sim steps" v={s.steps.toLocaleString()} />
            <Stat k="Orders" v={s.orders.toLocaleString()} />
            <Stat k="Throughput" v={`${s.ops.toLocaleString()}/s`} tone="pos" />
            <Stat k="Trades" v={s.tradesCount.toLocaleString()} />
            <Stat k="Volume" v={s.volume.toLocaleString()} />
            <Stat k="Book levels" v={`${s.book.bids.length + s.book.asks.length}`} />
          </dl>
          <p className="mt-3 border-t border-line pt-2 text-[10px] leading-relaxed text-faint">
            Matching engine mirrors the C++20 core (backend/, compiled + tested). Latent fair value,
            Poisson flow, aggressive prints, and cancellations drive the book live.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "pos" | "neg" }) {
  return <div className="flex items-center justify-between"><span className="label">{k}</span><span className={`mono font-medium ${tone === "pos" ? "pos" : tone === "neg" ? "neg" : "text-text"}`}>{v}</span></div>;
}

// ---- Depth ladder ----------------------------------------------------------
function DepthLadder({ book, mm }: { book: BookSnapshot; mm: MMState }) {
  const maxQty = Math.max(1, ...book.bids.map((l) => l.qty), ...book.asks.map((l) => l.qty));
  const asksTopDown = [...book.asks].reverse(); // deepest at top, best ask just above spread

  const Row = ({ tick, qty, orders, side, best }: { tick: number; qty: number; orders: number; side: "bid" | "ask"; best: boolean }) => {
    const isMM = side === "bid" ? tick === mm.quotesBid : tick === mm.quotesAsk;
    const w = (qty / maxQty) * 100;
    return (
      <div className={`relative flex items-center justify-between px-2 py-[3px] mono text-[11.5px] ${best ? "bg-line/40" : ""}`}>
        <div className={`absolute inset-y-0 ${side === "bid" ? "left-0 bg-green/15" : "left-0 bg-red/15"}`} style={{ width: `${w}%` }} />
        <span className={`relative z-10 flex items-center gap-1 ${side === "bid" ? "text-green" : "text-red"}`}>
          {isMM && <span className="text-cyan" title="market maker quote">◆</span>}
          {px(tick)}
        </span>
        <span className="relative z-10 text-faint">{orders}</span>
        <span className="relative z-10 text-text">{Math.round(qty)}</span>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between px-2 py-1 label"><span>Price</span><span>Ord</span><span>Size</span></div>
      <div>{asksTopDown.map((l, i) => <Row key={`a${l.tick}`} tick={l.tick} qty={l.qty} orders={l.orders} side="ask" best={i === asksTopDown.length - 1} />)}</div>
      <div className="flex items-center justify-between border-y border-line-2 bg-panel-2 px-2 py-1.5">
        <span className="mono text-[12px] font-semibold text-text">{book.mid ? px(book.mid) : "—"}</span>
        <span className="mono text-[10px] text-faint">spread {book.spreadTicks ?? "—"}t</span>
        <span className={`mono text-[11px] ${book.imbalance >= 0 ? "pos" : "neg"}`}>{book.imbalance >= 0 ? "▲" : "▼"} {Math.abs(book.imbalance * 100).toFixed(0)}%</span>
      </div>
      <div>{book.bids.map((l, i) => <Row key={`b${l.tick}`} tick={l.tick} qty={l.qty} orders={l.orders} side="bid" best={i === 0} />)}</div>
    </div>
  );
}

// ---- Depth chart (cumulative staircase) ------------------------------------
function DepthChart({ book }: { book: BookSnapshot }) {
  const W = 420, H = 150;
  if (!book.bids.length || !book.asks.length) return <div className="grid h-36 place-items-center text-[11px] text-muted">building book...</div>;
  let cb = 0, ca = 0;
  const bidsCum = book.bids.map((l) => ({ tick: l.tick, cum: (cb += l.qty) }));
  const asksCum = book.asks.map((l) => ({ tick: l.tick, cum: (ca += l.qty) }));
  const maxCum = Math.max(cb, ca);
  const minT = book.bids[book.bids.length - 1].tick;
  const maxT = book.asks[book.asks.length - 1].tick;
  const spanT = Math.max(1, maxT - minT);
  const x = (t: number) => ((t - minT) / spanT) * W;
  const y = (c: number) => H - (c / maxCum) * (H - 10);
  const bidPath = "M" + [...bidsCum].reverse().map((p) => `${x(p.tick).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" L") + ` L${x(book.bestBid ?? minT).toFixed(1)},${H}`;
  const askPath = "M" + asksCum.map((p) => `${x(p.tick).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" L") + ` L${x(book.bestAsk ?? maxT).toFixed(1)},${H}`;
  const midX = book.mid ? x(book.mid) : W / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <path d={bidPath + " Z"} fill="rgb(var(--green))" opacity="0.16" />
      <path d={askPath + " Z"} fill="rgb(var(--red))" opacity="0.16" />
      <polyline points={[...bidsCum].reverse().map((p) => `${x(p.tick).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ")} fill="none" stroke="rgb(var(--green))" strokeWidth="1.5" />
      <polyline points={asksCum.map((p) => `${x(p.tick).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ")} fill="none" stroke="rgb(var(--red))" strokeWidth="1.5" />
      <line x1={midX} x2={midX} y1={0} y2={H} stroke="rgb(var(--muted))" strokeDasharray="2 3" strokeWidth="1" />
    </svg>
  );
}

// ---- Streaming microprice line ---------------------------------------------
function MidChart({ mid, micro }: { mid: number[]; micro: number[] }) {
  const W = 560, H = 150, PAD = 6;
  const data = micro.filter((v) => v > 0);
  if (data.length < 2) return <div className="grid h-36 place-items-center text-[11px] text-muted">warming up...</div>;
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD);
  const line = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <path d={line(mid.filter((v) => v > 0))} fill="none" stroke="rgb(var(--muted))" strokeWidth="1" opacity="0.5" />
      <path d={line(data)} fill="none" stroke={up ? "rgb(var(--green))" : "rgb(var(--red))"} strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="3" fill={up ? "rgb(var(--green))" : "rgb(var(--red))"} className="pulsering" />
    </svg>
  );
}

// ---- Trade tape ------------------------------------------------------------
function Tape({ trades }: { trades: Trade[] }) {
  return (
    <div className="max-h-[240px] overflow-hidden">
      {trades.map((t, i) => (
        <div key={`${t.ts}-${i}`} className="flex items-center justify-between border-b border-line/50 px-2.5 py-[3px] mono text-[11px]">
          <span className={t.aggressor === "buy" ? "pos" : "neg"}>{t.aggressor === "buy" ? "▲" : "▼"} {px(t.tick)}</span>
          <span className="text-text">{Math.round(t.qty)}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Imbalance gauge -------------------------------------------------------
function ImbalanceGauge({ value, hist }: { value: number; hist: number[] }) {
  const pct = ((value + 1) / 2) * 100;
  const W = 300, H = 40;
  const series = hist.slice(-80);
  const x = (i: number) => (i / Math.max(1, series.length - 1)) * W;
  const y = (v: number) => H / 2 - (v * H) / 2;
  return (
    <div className="space-y-2">
      <div className="relative h-6 overflow-hidden rounded-sm bg-panel-2">
        <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
        <div className={`absolute inset-y-0 ${value >= 0 ? "bg-green/40" : "bg-red/40"}`} style={value >= 0 ? { left: "50%", width: `${pct - 50}%` } : { right: `${100 - pct}%`, left: `${pct}%` }} />
        <div className="absolute inset-0 grid place-items-center mono text-[11px] font-semibold text-text">{value >= 0 ? "BID" : "ASK"} {Math.abs(value * 100).toFixed(0)}%</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgb(var(--line))" strokeWidth="1" />
        <polyline points={series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="rgb(var(--blue))" strokeWidth="1.5" />
      </svg>
      <p className="text-[10px] text-faint">positive favors buyers, negative favors sellers. Leads short-horizon price moves.</p>
    </div>
  );
}

// ---- Market maker ----------------------------------------------------------
function MMView({ mm, pnl }: { mm: MMState; pnl: number[] }) {
  const W = 520, H = 90, PAD = 6;
  const data = pnl.length > 1 ? pnl : [0, 0];
  const lo = Math.min(...data, 0), hi = Math.max(...data, 0), span = hi - lo || 1;
  const x = (i: number) => PAD + (i / (data.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD);
  const invPct = Math.max(-100, Math.min(100, mm.inventory));
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.6fr]">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between"><span className="label">Realized P&L</span><span className={`mono text-lg font-semibold ${mm.pnl >= 0 ? "pos" : "neg"}`}>{mm.pnl >= 0 ? "+" : ""}{mm.pnl.toFixed(2)}</span></div>
        <div className="flex items-center justify-between"><span className="label">Inventory</span><span className={`mono ${mm.inventory > 0 ? "pos" : mm.inventory < 0 ? "neg" : "text-muted"}`}>{mm.inventory}</span></div>
        <div className="relative h-3 overflow-hidden rounded-sm bg-panel-2">
          <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
          <div className={`absolute inset-y-0 ${invPct >= 0 ? "bg-green/50" : "bg-red/50"}`} style={invPct >= 0 ? { left: "50%", width: `${invPct / 2}%` } : { right: "50%", width: `${-invPct / 2}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
          <div className="flex justify-between"><span className="label">Fills</span><span className="mono text-text">{mm.fills}</span></div>
          <div className="flex justify-between"><span className="label">Quote</span><span className="mono text-cyan">{mm.quotesBid ? px(mm.quotesBid) : "—"}/{mm.quotesAsk ? px(mm.quotesAsk) : "—"}</span></div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full self-center">
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="rgb(var(--border-2))" strokeDasharray="2 3" strokeWidth="1" />
        <path d={data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke={data[data.length - 1] >= 0 ? "rgb(var(--green))" : "rgb(var(--red))"} strokeWidth="1.75" />
      </svg>
    </div>
  );
}
