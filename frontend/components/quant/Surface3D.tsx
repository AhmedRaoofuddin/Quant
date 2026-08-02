"use client";

import { useMemo, useState } from "react";

// A 3D surface plot rendered in pure SVG: isometric projection, viridis colormap, painter's
// algorithm, and an azimuth control to spin it. Feed it any z-matrix (here, a risk surface).

function viridis(t: number): string {
  const stops: [number, number, number][] = [
    [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

export function Surface3D({ z, title, zLabel, wide = false }: { z: number[][]; title?: string; zLabel?: string; wide?: boolean }) {
  const [az, setAz] = useState(38);
  const [elev, setElev] = useState(26);

  const geom = useMemo(() => {
    const R = z.length, C = z[0]?.length ?? 0;
    if (R < 2 || C < 2) return null;
    let lo = Infinity, hi = -Infinity;
    for (const row of z) for (const v of row) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    const norm = (v: number) => (v - lo) / span;

    const th = (az * Math.PI) / 180;
    const ct = Math.cos(th), st = Math.sin(th);
    const eRad = (elev * Math.PI) / 180, se = Math.sin(eRad);
    const cx = (C - 1) / 2, cy = (R - 1) / 2;
    const hScale = 130 * (0.4 + se);

    const proj = (i: number, j: number, zn: number) => {
      let X = j - cx, Y = i - cy;
      const Xr = X * ct - Y * st, Yr = X * st + Y * ct;
      return { px: (Xr - Yr) * 15, py: (Xr + Yr) * 8 - zn * hScale, depth: Xr + Yr };
    };

    const pts: { px: number; py: number; depth: number }[][] = [];
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < R; i++) {
      pts[i] = [];
      for (let j = 0; j < C; j++) {
        const p = proj(i, j, norm(z[i][j]));
        pts[i][j] = p;
        minx = Math.min(minx, p.px); maxx = Math.max(maxx, p.px);
        miny = Math.min(miny, p.py); maxy = Math.max(maxy, p.py);
      }
    }
    // A wide canvas keeps a full-width card from becoming absurdly tall.
    const W = wide ? 1100 : 640, H = wide ? 360 : 400, pad = 24;
    const sx = (W - 2 * pad) / (maxx - minx || 1), sy = (H - 2 * pad) / (maxy - miny || 1);
    const s = Math.min(sx, sy);
    const ox = (W - (maxx - minx) * s) / 2 - minx * s;
    const oy = (H - (maxy - miny) * s) / 2 - miny * s;
    const T = (p: { px: number; py: number }) => ({ x: p.px * s + ox, y: p.py * s + oy });

    type Quad = { path: string; fill: string; depth: number };
    const quads: Quad[] = [];
    for (let i = 0; i < R - 1; i++) {
      for (let j = 0; j < C - 1; j++) {
        const a = T(pts[i][j]), b = T(pts[i][j + 1]), c = T(pts[i + 1][j + 1]), d = T(pts[i + 1][j]);
        const zn = (norm(z[i][j]) + norm(z[i][j + 1]) + norm(z[i + 1][j + 1]) + norm(z[i + 1][j])) / 4;
        const depth = pts[i][j].depth + pts[i + 1][j + 1].depth;
        quads.push({ path: `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}L${c.x.toFixed(1)},${c.y.toFixed(1)}L${d.x.toFixed(1)},${d.y.toFixed(1)}Z`, fill: viridis(zn), depth });
      }
    }
    quads.sort((p, q) => p.depth - q.depth);
    return { quads, W, H, lo, hi };
  }, [z, az, elev, wide]);

  if (!geom) return <div className="grid h-64 place-items-center text-xs text-muted">building surface...</div>;

  return (
    <div className="min-w-0">
      <svg viewBox={`0 0 ${geom.W} ${geom.H}`} preserveAspectRatio="xMidYMid meet" className="block h-auto w-full max-w-full">
        {geom.quads.map((q, i) => (
          <path key={i} d={q.path} fill={q.fill} stroke="rgb(255 255 255 / 0.08)" strokeWidth="0.4"
            className="fade-in-soft" style={{ animationDelay: `${Math.min((i / geom.quads.length) * 700, 700)}ms` }} />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-faint">
        <span className="flex items-center gap-1.5">azimuth <input type="range" min={0} max={90} value={az} onChange={(e) => setAz(+e.target.value)} className="h-1 w-20" /></span>
        <span className="flex items-center gap-1.5">elevation <input type="range" min={5} max={60} value={elev} onChange={(e) => setElev(+e.target.value)} className="h-1 w-16" /></span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="mono">{geom.lo.toFixed(1)}</span>
          <span className="h-2 w-16 shrink-0 rounded-sm" style={{ background: "linear-gradient(90deg, rgb(68,1,84), rgb(59,82,139), rgb(33,145,140), rgb(94,201,98), rgb(253,231,37))" }} />
          <span className="mono">{geom.hi.toFixed(1)}</span>
          {zLabel && <span className="truncate">{zLabel}</span>}
        </span>
      </div>
    </div>
  );
}
