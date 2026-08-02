import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const LIBRARY = [
  { expression: "rank(ts_mean(returns, 5)) - rank(ts_mean(returns, 20))", rationale: "Fast-vs-slow momentum spread." },
  { expression: "-1 * correlation(rank(close), rank(volume), 10)", rationale: "Price-volume divergence signals reversals." },
  { expression: "zscore(ts_mean(returns, 20))", rationale: "Standardised medium-term momentum." },
  { expression: "rank(ts_std(returns, 20)) * -1", rationale: "Low-volatility anomaly." },
  { expression: "-1 * delta(vwap, 3)", rationale: "VWAP mean-reversion." },
  { expression: "decay_linear(rank(returns), 5)", rationale: "Recency-weighted momentum." },
];

export async function GET() {
  return NextResponse.json(LIBRARY);
}
