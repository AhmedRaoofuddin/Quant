"use client";

// A small terminal chart kit: big stat callouts, a semicircular gauge, a donut, vertical bar
// charts, and a histogram helper. Dark, dense, mono, and driven by real numbers.

export function BigStat({ value, label, sub, tone = "text" }: { value: string; label: string; sub?: string; tone?: "text" | "pos" | "neg" | "blue" }) {
  const c = tone === "pos" ? "text-green" : tone === "neg" ? "text-red" : tone === "blue" ? "text-blue" : "text-text";
  return (
    <div className="panel flex flex-col justify-center px-4 py-3">
      <div className={`mono text-[34px] font-semibold leading-none ${c}`}>{value}</div>
      <div className="label mt-2">{label}</div>
      {sub && <div className="mono mt-0.5 text-[10.5px] text-faint">{sub}</div>}
    </div>
  );
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

export function Gauge({ value, min, max, label, format }: { value: number; min: number; max: number; label: string; format: (v: number) => string }) {
  const f = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const end = 180 - f * 180;
  const p = polar(100, 100, 78, end);
  const needle = polar(100, 100, 66, end);
  const color = f > 0.66 ? "rgb(var(--green))" : f > 0.4 ? "rgb(var(--amber))" : "rgb(var(--red))";
  return (
    <div className="panel flex flex-col items-center justify-center px-3 py-3">
      <svg viewBox="0 0 200 118" className="w-full max-w-[200px]">
        <path d="M22,100 A78,78 0 0 1 178,100" fill="none" stroke="rgb(var(--panel-2))" strokeWidth="12" strokeLinecap="round" />
        <path d={`M22,100 A78,78 0 0 1 ${p.x.toFixed(1)},${p.y.toFixed(1)}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
        <line x1="100" y1="100" x2={needle.x.toFixed(1)} y2={needle.y.toFixed(1)} stroke="rgb(var(--text))" strokeWidth="2" />
        <circle cx="100" cy="100" r="4" fill="rgb(var(--text))" />
        <text x="100" y="82" textAnchor="middle" className="fill-text mono" fontSize="26" fontWeight="600">{format(value)}</text>
      </svg>
      <div className="label -mt-1">{label}</div>
    </div>
  );
}

export function Donut({ items, label }: { items: { label: string; value: number; color: string }[]; label?: string }) {
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0">
        <g transform="rotate(-90 70 70)">
          {items.map((it, i) => {
            const frac = it.value / total;
            const seg = (
              <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={it.color} strokeWidth="18"
                strokeDasharray={`${(frac * C).toFixed(2)} ${C.toFixed(2)}`} strokeDashoffset={(-acc * C).toFixed(2)} />
            );
            acc += frac;
            return seg;
          })}
        </g>
        <text x="70" y="68" textAnchor="middle" className="fill-text mono" fontSize="20" fontWeight="600">{total}</text>
        {label && <text x="70" y="82" textAnchor="middle" className="fill-faint mono" fontSize="8">{label}</text>}
      </svg>
      <div className="grid grid-cols-1 gap-1">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1.5 mono text-[10px]">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: it.color }} />
            <span className="text-muted">{it.label}</span>
            <span className="ml-auto text-text">{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VBars({ items, height = 150, valueFmt }: { items: { label: string; value: number; color?: string }[]; height?: number; valueFmt?: (v: number) => string }) {
  // The viewBox width must track the real rendered width (~280px in the narrowest column),
  // otherwise the SVG scales down and the labels shrink with it. Measured: 40 units per bar
  // keeps the scale at ~1, so a font-size of 11 actually renders at 11 pixels.
  const W = 40 * Math.max(items.length, 1);
  const max = Math.max(...items.map((i) => i.value), 1);
  const slot = W / items.length;
  const bw = slot * 0.66;
  const H = height, top = 20, bottom = 26;
  const baseline = H - bottom;
  return (
    // Uniform scaling (no preserveAspectRatio="none"): stretching the viewBox squashes text
    // horizontally and makes labels unreadable. The viewBox is sized close to the rendered
    // width so 1 unit is about 1 pixel and the type stays legible.
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <line x1={0} x2={W} y1={baseline} y2={baseline} stroke="rgb(var(--border))" strokeWidth="1" />
      {items.map((it, i) => {
        const h = (it.value / max) * (H - top - bottom);
        const x = i * slot + (slot - bw) / 2;
        const y = baseline - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={Math.max(h, 1)} rx="2" fill={it.color ?? "rgb(var(--accent))"} opacity="0.9"
              className="grow-y" style={{ transformOrigin: `center ${baseline}px`, animationDelay: `${i * 45}ms` }} />
            {it.value > 0 && (
              <text x={x + bw / 2} y={y - 5} textAnchor="middle" className="fill-text mono" fontSize="11" fontWeight="600">
                {valueFmt ? valueFmt(it.value) : it.value}
              </text>
            )}
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-muted mono" fontSize="10">{it.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Horizontal distribution bars, rendered as real DOM rather than SVG.
 *
 * A 7-bin histogram in a ~280px column cannot fit a value label and an axis label per bar when
 * drawn vertically; the text ends up scaled down and unreadable. Laid out horizontally, the bucket
 * label and the count each get their own column and always render at their true size.
 */
export function HBars({
  items,
  unit,
}: {
  items: { label: string; value: number; color?: string }[];
  unit?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="mono w-10 shrink-0 text-right text-[11px] text-muted">{it.label}</span>
          <div className="relative h-4 flex-1 rounded-[2px] bg-bg">
            <div
              className="grow-x absolute inset-y-0 left-0 rounded-[2px]"
              style={{
                width: `${Math.max((it.value / max) * 100, it.value > 0 ? 2 : 0)}%`,
                background: it.color ?? "rgb(var(--accent))",
                opacity: 0.9,
                animationDelay: `${i * 45}ms`,
              }}
            />
          </div>
          <span className="mono w-7 shrink-0 text-right text-[12px] font-semibold text-text">{it.value}</span>
          <span className="mono w-9 shrink-0 text-right text-[10.5px] text-faint">
            {((it.value / total) * 100).toFixed(0)}%
          </span>
        </div>
      ))}
      {unit && <p className="pt-0.5 text-[10.5px] text-faint">{unit}</p>}
    </div>
  );
}

/** Bin a set of values into `bins` buckets over [min,max]; returns bar items labeled by range. */
export function histogram(values: number[], bins: number, min: number, max: number, fmt: (v: number) => string, color = "rgb(var(--blue))") {
  const counts = new Array(bins).fill(0);
  const w = (max - min) / bins;
  for (const v of values) {
    const idx = Math.max(0, Math.min(bins - 1, Math.floor((v - min) / w)));
    counts[idx]++;
  }
  return counts.map((c, i) => ({ label: fmt(min + i * w), value: c, color }));
}
