import type { Allocation } from "@/lib/types";

// Allocation blotter: monospace weights with an inline bar. Reads like a position sizer.

export function AllocationChart({ allocation }: { allocation: Allocation }) {
  const entries = Object.entries(allocation.weights).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, w]) => w), 0.0001);

  return (
    <div>
      <div className="space-y-2">
        {entries.map(([id, w]) => (
          <div key={id} className="flex items-center gap-2.5">
            <code className="mono w-10 shrink-0 text-[11px] text-muted">{id}</code>
            <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-panel-2">
              <div className="h-full bg-green/70" style={{ width: `${Math.max((w / max) * 100, 3)}%` }} />
            </div>
            <span className="mono w-12 shrink-0 text-right text-[11.5px] font-medium text-text">{(w * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div className="mono mt-3 border-t border-line pt-2 text-[10px] uppercase tracking-wide text-faint">
        {allocation.method.replace("_", " ")} · {entries.length} legs · Σw = 100%
      </div>
    </div>
  );
}
