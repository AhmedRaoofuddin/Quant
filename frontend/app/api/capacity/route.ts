import { NextResponse } from "next/server";
import { getUniverse } from "@/lib/marketdata";
import { analyseCapacity, bookFromAssets, DEFAULT_ASSUMPTIONS } from "@/lib/capacity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Capacity curve for a top-N equally weighted book drawn from the live universe. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const num = (k: string, d: number) => {
    const v = parseFloat(q.get(k) ?? "");
    return Number.isFinite(v) ? v : d;
  };
  try {
    const universe = await getUniverse();
    const book = bookFromAssets(universe.assets, Math.round(num("n", 10)));
    const report = analyseCapacity(book, {
      ...DEFAULT_ASSUMPTIONS,
      grossAnnReturn: num("grossReturn", DEFAULT_ASSUMPTIONS.grossAnnReturn),
      annVol: num("vol", DEFAULT_ASSUMPTIONS.annVol),
      annualTurnover: num("turnover", DEFAULT_ASSUMPTIONS.annualTurnover),
      eta: num("eta", DEFAULT_ASSUMPTIONS.eta),
      participationCap: num("cap", DEFAULT_ASSUMPTIONS.participationCap),
    });
    return NextResponse.json({ asOf: universe.asOf, ...report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
