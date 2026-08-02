import type { AssetStats } from "@/lib/quant-types";
import { sectorColor } from "@/lib/sectors";

// Average annualised return per sector, ranked. Real, aggregated from the universe.

export function SectorBars({ assets }: { assets: AssetStats[] }) {
  const bySector = new Map<string, number[]>();
  for (const a of assets) {
    if (!bySector.has(a.sector)) bySector.set(a.sector, []);
    bySector.get(a.sector)!.push(a.annReturn);
  }
  const rows = [...bySector.entries()]
    .map(([sector, rs]) => ({ sector, avg: rs.reduce((s, x) => s + x, 0) / rs.length, n: rs.length }))
    .sort((a, b) => b.avg - a.avg);
  const max = Math.max(...rows.map((r) => Math.abs(r.avg)), 0.01);

  // Distributes to fill whatever height the card has, so it never leaves a gap beside a
  // taller neighbour.
  return (
    <div className="flex h-full min-h-[220px] flex-col justify-between gap-2">
      {rows.map((r, i) => (
        <div key={r.sector} className="flex flex-1 items-center gap-3">
          <span className="w-28 shrink-0 truncate text-[12.5px] text-muted">{r.sector}</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-bg">
            <div className="grow-x absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${(Math.abs(r.avg) / max) * 100}%`, background: sectorColor(r.sector), opacity: 0.9, animationDelay: `${i * 70}ms` }} />
          </div>
          <span className="mono w-11 shrink-0 text-right text-[12.5px] font-medium text-text">{(r.avg * 100).toFixed(0)}%</span>
        </div>
      ))}
      <p className="shrink-0 pt-1 text-[11px] text-faint">mean annualised return by sector · {assets.length} names</p>
    </div>
  );
}
