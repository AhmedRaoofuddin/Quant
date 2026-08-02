"use client";

import { useState } from "react";
import { domainFor, logoSources } from "@/lib/logos";
import { sectorColor } from "@/lib/sectors";
import { universeMember } from "@/lib/universe";

/**
 * Company mark: tries each logo source in order, then falls back to a typographic monogram.
 *
 * `name` and `sector` are resolved from the universe when the caller does not pass them. Without
 * that lookup a call site like `<CompanyLogo symbol="MU" />` has no domain to resolve and drops
 * straight to initials, which is what used to leave holdings lists rendering as grey squares.
 */
export function CompanyLogo({
  symbol,
  name,
  sector,
  size = 22,
}: {
  symbol: string;
  name?: string;
  sector?: string;
  size?: number;
}) {
  const member = universeMember(symbol);
  const resolvedName = name ?? member?.name;
  const resolvedSector = sector ?? member?.sector ?? "";

  const sources = logoSources(domainFor(symbol, resolvedName));
  const [idx, setIdx] = useState(0);
  const failed = idx >= sources.length;

  if (failed) {
    return (
      <span
        className="inline-grid shrink-0 place-items-center rounded-[2px] font-semibold text-white"
        style={{ width: size, height: size, fontSize: size * 0.42, background: sectorColor(resolvedSector) }}
        title={resolvedName ?? symbol}
        aria-hidden
      >
        {symbol.slice(0, 2)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources[idx]}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      title={resolvedName ?? symbol}
      className="shrink-0 rounded-[2px] bg-white object-contain"
      style={{ width: size, height: size }}
    />
  );
}
