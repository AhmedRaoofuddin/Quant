"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";

/**
 * Application header: identity, primary navigation, session state.
 *
 * Navigation moved off a left rail and into the header because a research terminal is read
 * horizontally. A 186px sidebar on every route cost width from the tables and charts that are the
 * actual product, and it left the content edge misaligned with the header above it. Sections are
 * grouped into three menus so eleven routes fit one row without wrapping.
 */

interface Route { href: string; label: string; hint: string }

const GROUPS: { id: string; label: string; routes: Route[] }[] = [
  {
    id: "research",
    label: "Research",
    routes: [
      { href: "/", label: "Screener", hint: "78 equities, live analytics" },
      { href: "/markets", label: "Markets", hint: "36 cross-asset instruments" },
      { href: "/news", label: "News desk", hint: "9 feeds, LM sentiment" },
      { href: "/factors", label: "Factors", hint: "correlation and breadth" },
      { href: "/regimes", label: "Regimes", hint: "Gaussian HMM states" },
    ],
  },
  {
    id: "validation",
    label: "Validation",
    routes: [
      { href: "/strategies", label: "Strategies", hint: "20 rules, capacity and alpha" },
      { href: "/capacity", label: "Capacity", hint: "square-root impact curve" },
      { href: "/validation", label: "Firewall", hint: "PBO, deflated Sharpe" },
      { href: "/methodology", label: "Methodology", hint: "what is and is not modelled" },
    ],
  },
  {
    id: "execution",
    label: "Execution",
    routes: [
      { href: "/book", label: "Order book", hint: "price-time priority matching" },
      { href: "/live", label: "Live engine", hint: "streaming pipeline" },
    ],
  },
];

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" : path.startsWith(href);

export function Topbar() {
  const path = usePathname();
  const [clock, setClock] = useState("--:--:--");
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Route change should always dismiss any open menu, including on browser back.
  useEffect(() => { setOpen(null); setMobile(false); }, [path]);

  // Escape closes, and a click anywhere else does too, so a menu never strands the pointer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMobile(false); } };
    const onClick = () => setOpen(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("click", onClick); };
  }, []);

  const current = GROUPS.flatMap((g) => g.routes).find((r) => isActive(path, r.href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[52px] w-full max-w-[1680px] items-center gap-6 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo size={28} />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15.5px] tracking-tight text-text">Alpha-Forge</span>
            <span className="eyebrow mt-[3px]">Quant Terminal</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {GROUPS.map((g) => {
            const groupActive = g.routes.some((r) => isActive(path, r.href));
            return (
              <div key={g.id} className="relative">
                <button
                  type="button"
                  aria-expanded={open === g.id}
                  aria-haspopup="true"
                  onClick={(e) => { e.stopPropagation(); setOpen(open === g.id ? null : g.id); }}
                  className={`flex items-center gap-1.5 rounded-[2px] px-2.5 py-1.5 text-[12.5px] transition-colors ${
                    groupActive ? "bg-accent/8 font-medium text-accent" : "text-muted hover:bg-accent/5 hover:text-text"
                  }`}
                >
                  {g.label}
                  <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden
                       className={`transition-transform ${open === g.id ? "rotate-180" : ""}`}>
                    <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>

                {open === g.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 top-[calc(100%+6px)] z-50 w-[286px] rounded-[3px] border border-line bg-white p-1 shadow-lg shadow-accent/10"
                  >
                    {g.routes.map((r) => {
                      const on = isActive(path, r.href);
                      return (
                        <Link
                          key={r.href}
                          href={r.href}
                          aria-current={on ? "page" : undefined}
                          className={`block rounded-[2px] px-2.5 py-2 transition-colors ${
                            on ? "bg-accent/8" : "hover:bg-accent/5"
                          }`}
                        >
                          <span className={`block text-[12.5px] ${on ? "font-medium text-accent" : "text-text"}`}>
                            {r.label}
                          </span>
                          <span className="mono mt-0.5 block text-[10.5px] text-faint">{r.hint}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-4 text-[12px]">
          {current && (
            <span className="mono hidden text-[11px] text-faint xl:inline">{current.hint}</span>
          )}
          <span className="hidden items-center gap-2 text-muted sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-up blink" />
            Live data
          </span>
          <span className="mono hidden tabular-nums text-faint md:inline">{clock} UTC</span>

          <button
            type="button"
            aria-label="Menu"
            aria-expanded={mobile}
            onClick={(e) => { e.stopPropagation(); setMobile(!mobile); }}
            className="grid h-7 w-7 place-items-center rounded-[2px] border border-line text-muted lg:hidden"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              {mobile ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 7h18M3 12h18M3 17h18" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile: one flat list, since nested menus on a small screen are worse than scrolling. */}
      {mobile && (
        <div onClick={(e) => e.stopPropagation()} className="border-t border-line bg-white px-4 pb-3 pt-2 lg:hidden">
          {GROUPS.map((g) => (
            <div key={g.id} className="mb-2 last:mb-0">
              <div className="eyebrow px-1 pb-1">{g.label}</div>
              <div className="grid grid-cols-2 gap-1">
                {g.routes.map((r) => {
                  const on = isActive(path, r.href);
                  return (
                    <Link
                      key={r.href}
                      href={r.href}
                      aria-current={on ? "page" : undefined}
                      className={`rounded-[2px] px-2.5 py-2 text-[12.5px] ${
                        on ? "bg-accent/8 font-medium text-accent" : "text-text hover:bg-accent/5"
                      }`}
                    >
                      {r.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
