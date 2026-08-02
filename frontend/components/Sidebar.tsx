"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

type Item = { href: string; label: string; icon: ReactNode };

const GROUPS: { heading: string; items: Item[] }[] = [
  {
    heading: "Research",
    items: [
      { href: "/", label: "Screener", icon: <path d="M4 5h16M6 10h12M9 15h6M11 20h2" /> },
      { href: "/markets", label: "Markets", icon: <path d="M3 3v18h18M7 15l4-5 3 3 5-7" /> },
      { href: "/news", label: "News desk", icon: <path d="M4 5h13v14H4zM17 9h3v8a2 2 0 0 1-2 2h-1M7 9h7M7 13h7M7 16h4" /> },
      { href: "/factors", label: "Factors", icon: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /> },
      { href: "/regimes", label: "Regimes", icon: <path d="M3 15l4-6 4 3 4-8 6 11" /> },
    ],
  },
  {
    heading: "Execution",
    items: [
      { href: "/book", label: "Order book", icon: <path d="M4 6h7v12H4zM13 6h7v12h-7M4 10h7M13 10h7M4 14h7M13 14h7" /> },
      { href: "/live", label: "Live engine", icon: <path d="M3 12h4l3 7 4-14 3 7h4" /> },
    ],
  },
  {
    heading: "Validation",
    items: [
      { href: "/strategies", label: "Strategies", icon: <path d="M4 19V9M9 19V4M14 19v-7M19 19v-4" /> },
      { href: "/capacity", label: "Capacity", icon: <path d="M3 20h18M6 20V10M11 20V5M16 20v-8M21 20v-3" /> },
      { href: "/validation", label: "Firewall", icon: <path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /> },
      { href: "/methodology", label: "Methodology", icon: <path d="M5 4h10l4 4v12H5zM15 4v4h4M9 13h6M9 17h4" /> },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-[52px] hidden h-[calc(100vh-52px)] w-[186px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-white/45 px-2.5 py-4 backdrop-blur-xl lg:flex">
      {GROUPS.map((g) => (
        <div key={g.heading} className="flex flex-col gap-1">
          <span className="t-label px-3 pb-1.5">{g.heading}</span>
          {g.items.map((it) => {
            const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded-[2px] px-3 py-1.5 text-[12.5px] transition-colors ${
                  active ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-white/70 hover:text-text"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />}
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                  className={active ? "text-accent" : "text-faint group-hover:text-muted"}
                  aria-hidden
                >
                  {it.icon}
                </svg>
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
