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

export function sectorColor(sector: string): string {
  return SECTOR_COLORS[sector] ?? "#7a8a9a";
}
