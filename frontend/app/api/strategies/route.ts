import { NextResponse } from "next/server";
import { getUniverse } from "@/lib/marketdata";
import { runAllStrategies } from "@/lib/strategies";
import { alignReturns, cscvPbo, probabilisticSharpe } from "@/lib/validation";
import { moment } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Runs every strategy in the library, then applies the overfitting firewall to the family.
 * Testing six strategies on one dataset IS a multiple-testing problem, so the PBO is computed
 * across the family rather than pretending each was the only thing tried.
 */
export async function GET() {
  try {
    const universe = await getUniverse();
    const results = runAllStrategies(universe.assets);
    if (!results.length) return NextResponse.json({ error: "no strategy produced enough history" }, { status: 422 });

    const series: Record<string, { dates: string[]; returns: number[] }> = {};
    for (const r of results) series[r.id] = { dates: r.dates, returns: r.periodReturns };

    const aligned = alignReturns(series);
    const { pbo, lambdas, nCombos, bestId } = cscvPbo(aligned, 10);

    const strategies = results.map((r) => ({
      ...r,
      psr: probabilisticSharpe(r.grossSharpe, r.periodReturns.length,
        moment(r.periodReturns, 3), moment(r.periodReturns, 4)),
      // Deflate for the fact that the whole family was tried on one dataset.
      trials: results.length,
    }));

    return NextResponse.json({
      asOf: universe.asOf,
      strategies,
      family: {
        pbo, lambdas, nCombinations: nCombos, bestId,
        nStrategies: results.length,
        verdict: pbo <= 0.2 ? "robust" : pbo <= 0.5 ? "fragile" : "overfit",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
