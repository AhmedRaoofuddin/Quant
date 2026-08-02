"use client";

import { useEffect, useRef, useState } from "react";
import { annualisedSharpe, moment } from "@/lib/stats";
import { probabilisticSharpe } from "@/lib/validation";
import { Panel, Readout } from "@/components/Panel";
import { fmtNumber, fmtPercent } from "@/lib/format";

// A live streaming engine. A Markov-switching market drives the deployed strategy tick by tick:
// equity grows, a rolling Sharpe and Probabilistic Sharpe recompute as the track record
// accumulates, the HMM-style regime flips, and an event tape logs it all. Everything is computed
// live in the browser from the streamed returns. Labeled SIM because it is a simulated feed.

const TICK_MS = 90;
const WINDOW = 320;      // equity points drawn
const ROLL = 60;         // rolling Sharpe window
const CW = 900, CH = 300, PAD = 8;

interface Snapshot {
  equity: number[];
  bars: number;
  pnl: number;
  rollSharpe: number;
  drawdown: number;
  regime: 0 | 1;
  psr: number;
  peakEquity: number;
  tps: number;
  events: { t: number; msg: string; tone: "pos" | "neg" | "neutral" }[];
}

export function LiveEngine() {
  const [running, setRunning] = useState(true);
  const [snap, setSnap] = useState<Snapshot>({
    equity: [1], bars: 0, pnl: 0, rollSharpe: 0, drawdown: 0, regime: 0, psr: 0.5,
    peakEquity: 1, tps: 0, events: [],
  });

  const sim = useRef({
    equity: [1] as number[],
    returns: [] as number[],
    peak: 1,
    regime: 0 as 0 | 1,
    volEwma: 0.01,
    lastPsrAt: 0,
    psr: 0.5,
    tickTimes: [] as number[],
    events: [] as { t: number; msg: string; tone: "pos" | "neg" | "neutral" }[],
  });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const s = sim.current;

      // Markov-switching market: calm persists, turbulence is high-vol with negative drift.
      const switchP = s.regime === 0 ? 0.01 : 0.06;
      if (Math.random() < switchP) {
        const prev = s.regime;
        s.regime = (1 - s.regime) as 0 | 1;
        s.events.unshift({
          t: s.returns.length,
          msg: `Regime shift ${prev === 0 ? "Calm" : "Turbulent"} to ${s.regime === 0 ? "Calm" : "Turbulent"}`,
          tone: s.regime === 1 ? "neg" : "pos",
        });
      }
      const vol = s.regime === 0 ? 0.006 : 0.02;
      const drift = s.regime === 0 ? 0.0007 : -0.0006;
      const shock = drift + vol * gaussian();

      // Deployed strategy return: small structural edge, dampened in turbulence, plus noise.
      const edge = 0.0006 - (s.regime === 1 ? 0.0009 : 0);
      const ret = edge + 0.7 * shock + 0.004 * gaussian();

      s.returns.push(ret);
      const nextEq = s.equity[s.equity.length - 1] * (1 + ret);
      s.equity.push(nextEq);
      if (s.equity.length > 4000) { s.equity.shift(); }
      if (s.returns.length > 4000) { s.returns.shift(); }

      const newHigh = nextEq > s.peak;
      s.peak = Math.max(s.peak, nextEq);
      const dd = nextEq / s.peak - 1;
      if (newHigh && s.returns.length % 40 === 0) s.events.unshift({ t: s.returns.length, msg: "New equity high", tone: "pos" });
      if (dd < -0.06 && s.returns.length % 25 === 0) s.events.unshift({ t: s.returns.length, msg: `Drawdown ${(dd * 100).toFixed(1)}%`, tone: "neg" });

      // Rolling Sharpe.
      const window = s.returns.slice(-ROLL);
      const rollSharpe = annualisedSharpe(window);

      // Probabilistic Sharpe recomputed about once per second as the record grows.
      const now = s.returns.length;
      if (now - s.lastPsrAt >= 11 && s.returns.length > 30) {
        const full = s.returns;
        s.psr = probabilisticSharpe(annualisedSharpe(full), full.length, moment(full, 3), moment(full, 4));
        s.lastPsrAt = now;
      }

      // ticks/sec estimate.
      const tnow = performance.now();
      s.tickTimes.push(tnow);
      s.tickTimes = s.tickTimes.filter((x) => tnow - x < 1000);
      s.events = s.events.slice(0, 40);

      setSnap({
        equity: s.equity.slice(-WINDOW),
        bars: s.returns.length,
        pnl: nextEq - 1,
        rollSharpe,
        drawdown: dd,
        regime: s.regime,
        psr: s.psr,
        peakEquity: s.peak,
        tps: s.tickTimes.length,
        events: s.events,
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="space-y-2.5">
      <div className="panel flex flex-wrap items-center justify-between">
        <div className="flex flex-wrap">
          <Readout label="Live P&L" value={fmtPercent(snap.pnl, 2)} tone={snap.pnl >= 0 ? "pos" : "neg"} sub="since start" />
          <Readout label="Rolling Sharpe" value={fmtNumber(snap.rollSharpe)} tone={snap.rollSharpe > 0.5 ? "pos" : snap.rollSharpe < 0 ? "neg" : "neutral"} sub={`${ROLL}-bar`} />
          <Readout label="Drawdown" value={fmtPercent(snap.drawdown, 1)} tone={snap.drawdown < -0.05 ? "neg" : "neutral"} sub="from peak" />
          <Readout label="Prob. Sharpe" value={fmtPercent(snap.psr, 0)} tone={snap.psr > 0.9 ? "pos" : snap.psr < 0.5 ? "neg" : "neutral"} sub="live significance" />
          <Readout label="Regime" value={snap.regime === 1 ? "TURBULENT" : "CALM"} tone={snap.regime === 1 ? "neg" : "pos"} sub="live state" />
          <Readout label="Bars" value={snap.bars.toLocaleString()} sub={`${snap.tps} ticks/s`} />
        </div>
        <div className="flex items-center gap-3 px-3">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${running ? "bg-green pulsering" : "bg-faint"}`} />
            <span className="mono text-[10px] text-muted">{running ? "STREAMING" : "PAUSED"}</span>
          </span>
          <button onClick={() => setRunning((r) => !r)} className="rounded-sm border border-line px-3 py-1 mono text-[11px] uppercase text-muted transition hover:bg-panel hover:text-text">
            {running ? "Pause" : "Resume"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        <Panel title="Live equity" accent="green" className="lg:col-span-2" right={`streaming · ${snap.regime === 1 ? "turbulent" : "calm"} regime`}>
          <LiveChart equity={snap.equity} regime={snap.regime} />
        </Panel>
        <Panel title="Engine tape" accent="cyan" bodyClass="p-0" right="live events">
          <div className="max-h-[300px] overflow-auto">
            {snap.events.length === 0 && <div className="grid h-24 place-items-center text-[11px] text-faint">warming up...</div>}
            {snap.events.map((e, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-line/60 px-3 py-1.5 mono text-[11px]">
                <span className="text-faint">{String(e.t).padStart(4, "0")}</span>
                <span className={e.tone === "pos" ? "pos" : e.tone === "neg" ? "neg" : "text-muted"}>
                  {e.tone === "pos" ? "▲" : e.tone === "neg" ? "▼" : "•"}
                </span>
                <span className="text-text">{e.msg}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function LiveChart({ equity, regime }: { equity: number[]; regime: 0 | 1 }) {
  if (equity.length < 2) return <div className="grid h-48 place-items-center text-xs text-muted">warming up...</div>;
  const min = Math.min(...equity), max = Math.max(...equity);
  const span = max - min || 0.01;
  const x = (i: number) => PAD + (i / (equity.length - 1)) * (CW - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (CH - 2 * PAD);
  const line = equity.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(equity.length - 1).toFixed(1)},${CH - PAD} L${x(0).toFixed(1)},${CH - PAD} Z`;
  const last = equity[equity.length - 1];
  const stroke = regime === 1 ? "rgb(var(--red))" : "rgb(var(--green))";

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${CW} ${CH}`} className="h-auto w-full">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lg)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />
        <circle cx={x(equity.length - 1)} cy={y(last)} r="3.5" fill={stroke} stroke="rgb(var(--panel))" strokeWidth="2" className="pulsering" />
      </svg>
    </div>
  );
}

// Standard normal via Box-Muller.
function gaussian(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
