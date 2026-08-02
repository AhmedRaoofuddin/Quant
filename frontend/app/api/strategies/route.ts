import { NextResponse } from "next/server";
import { getUniverse } from "@/lib/marketdata";
import { runAllStrategies } from "@/lib/strategies";
import { alignReturns, cscvPbo, probabilisticSharpe } from "@/lib/validation";
import { analysePortfolio, type NameLiquidity, type StrategyInput } from "@/lib/portfolio";
import { attribute, buildFactors } from "@/lib/attribution";
import { fitMarketRegimes, regimePerformance } from "@/lib/regime-perf";
import { mean, moment, TRADING_DAYS } from "@/lib/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The full evaluation pass over the strategy library.
 *
 * Running many strategies on one dataset IS a multiple-testing problem, so PBO is computed across
 * the family rather than pretending each rule was the only thing ever tried. On top of that:
 *
 *   - factor attribution separates alpha from repackaged beta,
 *   - regime slicing shows where each rule actually earns,
 *   - joint capacity measures what the blend can carry once overlapping names compete for the
 *     same liquidity, which is strictly less than the sum of the parts.
 */
export async function GET() {
  try {
    const universe = await getUniverse();
    const results = runAllStrategies(universe.assets);
    if (!results.length) {
      return NextResponse.json({ error: "no strategy produced enough history" }, { status: 422 });
    }

    const series: Record<string, { dates: string[]; returns: number[] }> = {};
    for (const r of results) series[r.id] = { dates: r.dates, returns: r.periodReturns };

    const aligned = alignReturns(series);
    const { pbo, lambdas, nCombos, bestId } = cscvPbo(aligned, 10);

    // Periods per year, inferred once from the panel length (the series is downsampled).
    const usable = universe.assets.filter((a) => a.series.length > 60 && a.advUsd > 0);
    const T = usable.length ? Math.min(...usable.map((a) => a.series.length)) : TRADING_DAYS;
    const periodsPerYear = TRADING_DAYS / Math.max(1, Math.round(756 / T));

    // --- factor attribution -------------------------------------------------
    const factors = buildFactors(universe.assets);
    const attributions = Object.fromEntries(
      results
        .map((r) => attribute(r.id, r.dates, r.periodReturns, factors, periodsPerYear))
        .filter((a): a is NonNullable<typeof a> => a !== null)
        .map((a) => [a.strategyId, a]),
    );

    // --- regime-conditional performance -------------------------------------
    const marketReturns = factors.returns.MKT;
    const regimeModel = fitMarketRegimes(factors.dates, marketReturns);
    const regimes = regimeModel
      ? Object.fromEntries(
          results
            .map((r) => regimePerformance(r.id, r.dates, r.periodReturns, regimeModel, periodsPerYear))
            .filter((p): p is NonNullable<typeof p> => p !== null)
            .map((p) => [p.strategyId, p]),
        )
      : {};

    // --- joint capacity of the blended book ---------------------------------
    const liquidity: Record<string, NameLiquidity> = {};
    for (const a of universe.assets) {
      liquidity[a.symbol] = {
        advUsd: a.advUsd,
        dailyVol: a.annVol / Math.sqrt(TRADING_DAYS),
        spreadBps: a.spreadBps,
      };
    }
    const inputs: StrategyInput[] = results.map((r) => ({
      id: r.id, name: r.name, weights: r.weights, returns: r.periodReturns,
      grossAnnReturn: r.grossAnnReturn, annVol: r.annVol,
      annualTurnover: r.annualTurnover, deployableCapacity: r.capacity.deployableCapacity,
    }));
    const portfolio = analysePortfolio(inputs, liquidity);

    const strategies = results.map((r) => ({
      ...r,
      psr: probabilisticSharpe(r.grossSharpe, r.periodReturns.length,
        moment(r.periodReturns, 3), moment(r.periodReturns, 4)),
      // Deflate for the fact that the whole family was tried on one dataset.
      trials: results.length,
      attribution: attributions[r.id] ?? null,
      regime: regimes[r.id] ?? null,
    }));

    return NextResponse.json({
      asOf: universe.asOf,
      periodsPerYear,
      strategies,
      family: {
        pbo, lambdas, nCombinations: nCombos, bestId,
        nStrategies: results.length,
        verdict: pbo <= 0.2 ? "robust" : pbo <= 0.5 ? "fragile" : "overfit",
      },
      portfolio,
      factorPanel: {
        keys: Object.keys(factors.returns),
        nObs: factors.dates.length,
        annReturns: Object.fromEntries(
          Object.entries(factors.returns).map(([k, v]) => [k, mean(v) * periodsPerYear]),
        ),
        // Named so the omission is visible in the payload, not buried in a source comment.
        missing: ["HML (book-to-market): requires fundamentals this universe does not carry"],
      },
      regimeModel: regimeModel
        ? {
            labels: regimeModel.labels,
            currentState: regimeModel.currentState,
            stationary: regimeModel.stationary,
            expectedDuration: regimeModel.expectedDuration,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
