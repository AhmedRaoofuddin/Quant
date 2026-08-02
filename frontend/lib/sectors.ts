// Fixed sector -> hue mapping, assigned in a stable order and never cycled, so a colour always
// means the same sector across every chart. Navy-led and de-saturated: readable on white paper,
// nothing pops harshly.

export const SECTOR_COLORS: Record<string, string> = {
  Technology: "#0B2D43",     // deep navy
  Financials: "#4E7CA1",     // medium blue
  Healthcare: "#3d8361",     // muted green
  Consumer: "#AD833B",       // muted gold
  Energy: "#B0413A",         // clay
  Industrials: "#5C6B75",    // slate
  Communications: "#9fbcd6", // light blue
};

/**
 * The same hues darkened for use as text.
 *
 * A fill and a label have different contrast requirements. Communications at #9fbcd6 works as a
 * 10px swatch and measures 1.89:1 as type on the card surface, which is unreadable; Consumer gold
 * managed 3.31:1. These are the same hues pushed down in luminance until each clears WCAG AA, so a
 * sector keeps its identity whether it is drawn or written.
 *
 * Use `sectorColor` for fills and strokes, `sectorInk` for anything the eye has to read.
 */
export const SECTOR_INK: Record<string, string> = {
  Technology: "#0B2D43",     // already 12.9:1, unchanged
  Financials: "#3A6285",
  Healthcare: "#2F6B4E",
  Consumer: "#7E5F26",
  Energy: "#93342E",
  Industrials: "#4A5761",
  Communications: "#41708F",
};

export function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? "#7a8a9a";
}

/** Readable variant of the sector hue, for labels rather than fills. */
export function sectorInk(sector: string): string {
  return SECTOR_INK[sector] ?? "#5A6670";
}
