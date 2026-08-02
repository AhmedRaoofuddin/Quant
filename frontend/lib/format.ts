// Small formatting helpers with tabular-friendly output.

export function fmtNumber(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return x.toFixed(digits);
}

export function fmtPercent(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtSigned(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const s = x.toFixed(digits);
  return x > 0 ? `+${s}` : s;
}

export function toneForSharpe(x: number): "positive" | "negative" | "neutral" {
  if (x > 0.3) return "positive";
  if (x < 0) return "negative";
  return "neutral";
}

export function shortDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}
