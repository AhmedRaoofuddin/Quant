"use client";

import { useMemo, useState } from "react";
import type { AssetStats } from "@/lib/quant-types";

// Cross-asset return correlation, reordered by sector so intra-sector blocks stand out. Warm =
// positively correlated, cool = negatively, dark = uncorrelated. Hover reads the exact pair.

// Diverging: warm gold for positive correlation, cool navy for negative, near-white at zero.
function color(c: number): string {
  const base = [245, 248, 250], warm = [173, 131, 59], cool = [11, 45, 67];
  const a = Math.min(1, Math.abs(c)), hue = c >= 0 ? warm : cool;
  const m = base.map((b, i) => Math.round(b * (1 - a) + hue[i] * a));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

export function AssetHeatmap({ assets, ids, matrix }: { assets: AssetStats[]; ids: string[]; matrix: number[][] }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const ord = useMemo(() => {
    const sectorOf = new Map(assets.map((a) => [a.symbol, a.sector]));
    const order = ids.map((id, i) => ({ id, i, sector: sectorOf.get(id) ?? "" }))
      .sort((a, b) => a.sector.localeCompare(b.sector) || a.id.localeCompare(b.id));
    const idx = order.map((o) => o.i);
    const labels = order.map((o) => o.id);
    const m = idx.map((r) => idx.map((c) => matrix[r][c]));
    return { labels, m };
  }, [assets, ids, matrix]);

  const n = ord.labels.length;
  if (n < 2) return <div className="grid h-40 place-items-center text-xs text-muted">no data</div>;

  return (
    <div className="space-y-2">
      {/* Cells are fractional so the matrix always fits its card, never scrolls or clips. */}
      <div className="grid w-full gap-px" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} onMouseLeave={() => setHover(null)}>
        {ord.m.map((row, i) =>
          row.map((c, j) => (
            <div key={`${i}-${j}`} onMouseEnter={() => setHover({ i, j })}
              className="aspect-square w-full" style={{ backgroundColor: color(c) }}
              title={`${ord.labels[i]} · ${ord.labels[j]} = ${c.toFixed(2)}`} />
          )),
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-faint">
        <span>−1</span>
        <div className="h-2 w-28 rounded-sm" style={{ background: "linear-gradient(90deg, rgb(11,45,67), rgb(245,248,250), rgb(173,131,59))" }} />
        <span>+1</span>
        <span className="ml-2 mono text-muted">{hover ? `${ord.labels[hover.i]} · ${ord.labels[hover.j]} = ${ord.m[hover.i][hover.j].toFixed(2)}` : `${n} assets, ordered by sector`}</span>
      </div>
    </div>
  );
}
