"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function Topbar() {
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-13 border-b border-line bg-white/70 backdrop-blur-xl">
      <div className="flex h-full items-center gap-4 px-5 py-2.5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-[2px] bg-accent font-display text-[15px] text-white">α</span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[16px] tracking-tight text-text">Alpha-Forge</span>
            <span className="eyebrow mt-1">Quant Terminal</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-5 text-[12px]">
          <span className="hidden items-center gap-2 text-muted sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-up blink" />
            Live data
          </span>
          <span className="mono hidden text-faint md:inline">{clock} UTC</span>
        </div>
      </div>
    </header>
  );
}
