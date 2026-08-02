"use client";

import { useState } from "react";
import type { RegimeModelData } from "@/lib/types";

// A full-width timeline of regime segments plus the HMM transition-probability matrix.

export function RegimeTimeline({ regimes }: { regimes: RegimeModelData }) {
  const [hover, setHover] = useState<{ label: string; span: string } | null>(null);
  const n = regimes.states.length;
  if (n < 2) return <div className="grid h-10 place-items-center text-[11px] text-muted">No regime data.</div>;

  // Build contiguous segments.
  const segs: { start: number; end: number; state: number }[] = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || regimes.states[i] !== regimes.states[start]) {
      segs.push({ start, end: i - 1, state: regimes.states[start] });
      start = i;
    }
  }

  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-sm border border-line">
        {segs.map((s, i) => {
          const w = ((s.end - s.start + 1) / n) * 100;
          const turbulent = s.state === 1;
          return (
            <div
              key={i}
              className={`h-full ${turbulent ? "bg-red/45" : "bg-blue/20"} transition-opacity hover:opacity-100`}
              style={{ width: `${w}%` }}
              onMouseEnter={() => setHover({ label: turbulent ? "Turbulent" : "Calm", span: `${regimes.dates[s.start]?.slice(0, 7)} to ${regimes.dates[s.end]?.slice(0, 7)}` })}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-faint">
        <span className="mono">{regimes.dates[0]?.slice(0, 7)}</span>
        <span className={`mono ${hover ? "text-text" : ""}`}>{hover ? `${hover.label} · ${hover.span}` : `${segs.length} regime segments`}</span>
        <span className="mono">{regimes.dates[n - 1]?.slice(0, 7)}</span>
      </div>
    </div>
  );
}

export function TransitionMatrix({ regimes }: { regimes: RegimeModelData }) {
  const A = regimes.transition;
  // Light-theme ramp: near-white at 0, brand navy at 1. Text flips to white only once the cell
  // is dark enough to need it, so every value stays legible at any probability.
  const cell = (p: number) => {
    const a = Math.min(1, Math.max(0, p));
    const base = [245, 248, 250], hue = [11, 45, 67];
    const mix = base.map((b, i) => Math.round(b * (1 - a) + hue[i] * a));
    return { bg: `rgb(${mix[0]},${mix[1]},${mix[2]})`, fg: a > 0.55 ? "#ffffff" : "rgb(var(--text))" };
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid gap-px" style={{ gridTemplateColumns: "auto minmax(0,1fr) minmax(0,1fr)" }}>
        <div />
        {regimes.labels.map((l) => (
          <div key={l} className="whitespace-nowrap px-2 pb-1.5 text-center eyebrow">to {l}</div>
        ))}
        {A.map((row, i) => (
          <div key={i} className="contents">
            <div className="flex items-center justify-end whitespace-nowrap pr-2 eyebrow">from {regimes.labels[i]}</div>
            {row.map((p, j) => {
              const c = cell(p);
              return (
                <div key={j} className="grid h-11 min-w-[74px] place-items-center rounded-[2px] mono text-[14px] font-semibold"
                  style={{ backgroundColor: c.bg, color: c.fg }}>
                  {(p * 100).toFixed(0)}%
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-[10.5px] text-faint">daily state-transition probabilities (Baum-Welch)</p>
    </div>
  );
}
