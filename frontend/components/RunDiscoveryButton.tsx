"use client";

import { useState } from "react";
import { triggerDiscovery } from "@/lib/data";
import type { DiscoveryRun } from "@/lib/types";

export function RunDiscoveryButton({ onComplete }: { onComplete: (run: DiscoveryRun) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onComplete(await triggerDiscovery(12, "risk_parity"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="mono text-[10px] text-red">{error}</span>}
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-sm border border-green/50 bg-green/15 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-green transition hover:bg-green/25 active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-green/30 border-t-green" />
            Running
          </>
        ) : (
          <>
            <span className="text-[13px] leading-none">▶</span> Run discovery
          </>
        )}
      </button>
    </div>
  );
}
