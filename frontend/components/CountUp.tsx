"use client";

import { useEffect, useRef, useState } from "react";

// Animate a number toward its target with an ease-out. Used on the KPI readouts so values roll in.

export function CountUp({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const raf = useRef<number>();

  useEffect(() => {
    const start = from.current;
    const delta = value - start;
    const dur = 650;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const p = Math.min(1, (ts - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + delta * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
