/**
 * The Alpha-Forge mark.
 *
 * The glyph is the capacity curve: net profit rises with capital, peaks, then dies as market
 * impact overtakes the edge. It is the one idea the whole product is built on, so it is worth more
 * as an identity than a stylised letter would be. The dot sits on the maximum.
 *
 * `tone="light"` inverts it for dark surfaces such as the footer.
 */
export function Logo({ size = 28, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  const plate = tone === "dark" ? "rgb(var(--accent))" : "#F2F6F8";
  const ink = tone === "dark" ? "#F2F6F8" : "rgb(11 45 67)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role="img"
      aria-label="Alpha-Forge"
      className="shrink-0"
    >
      <rect width="28" height="28" rx="2.5" fill={plate} />
      {/* rises, peaks, dies */}
      <path
        d="M5 20.5 C 8.2 20.5, 10.4 8.6, 14 8.6 C 17.6 8.6, 19.8 20.5, 23 20.5"
        fill="none"
        stroke={ink}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.92"
      />
      <circle cx="14" cy="8.6" r="2.1" fill={ink} />
      <line x1="5" y1="23.2" x2="23" y2="23.2" stroke={ink} strokeWidth="1.4" strokeLinecap="round" opacity="0.42" />
    </svg>
  );
}
