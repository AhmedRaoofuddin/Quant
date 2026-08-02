"use client";

import { useState } from "react";

// Diverging correlation heatmap for the light theme. Positive correlation (redundancy) reads warm
// (amber), negative reads cool (blue), near-zero stays near-white so the grid recedes and only the
// strong pairs draw the eye. Two hues, no rainbow.

const COOL = [31, 94, 168];   // strong blue at -1
const PAPER = [252, 252, 251]; // near-white at 0
const WARM = [186, 126, 16];  // strong amber at +1

function cellRgb(c: number): [number, number, number] {
  const a = Math.min(1, Math.abs(c));
  const hue = c >= 0 ? WARM : COOL;
  // Ease the ramp so mid correlations stay legible rather than washing out.
  const t = Math.pow(a, 0.75);
  return PAPER.map((p, i) => Math.round(p * (1 - t) + hue[i] * t)) as [number, number, number];
}

/** WCAG relative luminance, used to pick ink or paper text rather than guessing from |c|. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Whichever of ink/paper has the higher contrast ratio against the cell. */
function textOn(rgb: [number, number, number]): string {
  const L = luminance(rgb);
  const withWhite = 1.05 / (L + 0.05);
  const withInk = (L + 0.05) / 0.07;
  return withWhite > withInk ? "#ffffff" : "#11161c";
}

export function Heatmap({ ids, matrix }: { ids: string[]; matrix: number[][] }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const n = ids.length;
  if (n < 2) return <div className="grid h-40 place-items-center text-xs text-muted">Not enough factors.</div>;

  const label = hover
    ? `${ids[hover.i]} · ${ids[hover.j]} = ${matrix[hover.i][hover.j].toFixed(2)}`
    : "pairwise return correlation";

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* Rows are 1fr inside a flex-1 track, so the matrix grows to fill the panel instead of
          leaving a void when the neighbouring card is taller. */}
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div
          className="grid h-full min-w-full"
          style={{
            gridTemplateColumns: `34px repeat(${n}, minmax(26px, 1fr))`,
            gridTemplateRows: `14px repeat(${n}, minmax(24px, 1fr))`,
          }}
        >
          <div />
          {ids.map((id, j) => (
            <div
              key={id}
              className={`px-0.5 text-center mono text-[9.5px] leading-none transition-colors ${
                hover?.j === j ? "font-semibold text-accent" : "text-muted"
              }`}
            >
              {id}
            </div>
          ))}

          {matrix.map((row, i) => (
            <div key={i} className="contents">
              <div
                className={`grid place-items-end pr-1.5 mono text-[9.5px] transition-colors ${
                  hover?.i === i ? "font-semibold text-accent" : "text-muted"
                }`}
              >
                {ids[i]}
              </div>
              {row.map((c, j) => {
                const diag = i === j;
                const rgb = cellRgb(c);
                const on = hover?.i === i && hover?.j === j;
                return (
                  <div
                    key={j}
                    onMouseEnter={() => setHover({ i, j })}
                    onMouseLeave={() => setHover(null)}
                    className={`relative grid place-items-center border border-white/70 mono text-[10px] tabular-nums ${
                      diag ? "" : "cursor-default"
                    } ${on ? "z-10 outline outline-2 outline-accent" : ""}`}
                    style={{
                      backgroundColor: diag ? "rgb(233 236 239)" : `rgb(${rgb.join(",")})`,
                      color: diag ? "rgb(90 100 110)" : textOn(rgb),
                      fontWeight: Math.abs(c) >= 0.6 && !diag ? 600 : 400,
                    }}
                    title={`${ids[i]} · ${ids[j]} = ${c.toFixed(2)}`}
                  >
                    {diag ? "1" : c.toFixed(1).replace(/^(-?)0\./, "$1.")}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-line pt-2 text-[10.5px] text-muted">
        <span className="mono">-1</span>
        <div
          className="h-2 w-24 rounded-sm border border-line"
          style={{ background: `linear-gradient(90deg, rgb(${COOL.join(",")}), rgb(${PAPER.join(",")}), rgb(${WARM.join(",")}))` }}
        />
        <span className="mono">+1</span>
        <span className={`ml-auto ${hover ? "mono text-text" : ""}`}>{label}</span>
      </div>
    </div>
  );
}
