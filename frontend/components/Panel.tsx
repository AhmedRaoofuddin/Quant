import { ReactNode } from "react";

// Data must be readable the instant it renders, so cards do not fade in on scroll. Motion lives
// inside the charts (lines draw, bars grow), where it communicates rather than obstructs.

/**
 * A card is a surface with an inline title, not a boxed widget with a header bar.
 * `accent` is accepted for call-site compatibility but no longer paints a coloured dot;
 * colour is reserved for data, not chrome.
 */
export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClass = "",
  accent,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  accent?: "blue" | "green" | "amber" | "cyan" | "red";
}) {
  void accent;
  const flush = bodyClass.includes("p-0");
  return (
    <section className={`card flex min-w-0 flex-col ${flush ? "card-flush" : ""} ${className}`}>
      <header className={`flex items-baseline justify-between gap-3 ${flush ? "px-3 pb-2 pt-3" : "pb-2"}`}>
        <h3 className="t-title">{title}</h3>
        {right && <span className="mono shrink-0 text-[11px] text-faint">{right}</span>}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** A single metric in a horizontal strip. */
export function Readout({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "pos" | "neg";
  sub?: string;
}) {
  const c = tone === "pos" ? "up" : tone === "neg" ? "down" : "text-text";
  return (
    <div className="flex min-w-[118px] flex-col gap-1 px-4 py-2.5">
      <span className="eyebrow">{label}</span>
      <span className={`t-metric ${c}`}>{value}</span>
      {sub && <span className="text-[11px] text-faint">{sub}</span>}
    </div>
  );
}

/** Horizontal strip of metrics with hairline dividers. */
export function MetricBar({ children }: { children: ReactNode }) {
  return <div className="card flex flex-wrap items-stretch divide-x divide-line p-0">{children}</div>;
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "red" | "amber" | "blue";
}) {
  const map = {
    neutral: "border-line-strong text-muted",
    green: "border-up/40 text-up bg-up/10",
    red: "border-down/40 text-down bg-down/10",
    amber: "border-warn/40 text-warn bg-warn/10",
    blue: "border-accent/40 text-accent bg-accent/10",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[tone]}`}>
      {children}
    </span>
  );
}

/** Page-level section heading: plain text + hairline, no box. */
export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-line pb-2">
      <div>
        <h2 className="font-display text-[22px] leading-none text-text">{title}</h2>
        {sub && <p className="mt-1.5 text-[12px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
