// Shared client-safe types for the market-data universe (no server imports here).

export interface AssetStats {
  symbol: string; name: string; sector: string;
  last: number;
  totalReturn: number;
  annReturn: number;
  annVol: number;
  sharpe: number;
  maxDrawdown: number;
  beta: number;
  series: number[];
  dates: string[];
  ohlc: { d: string; o: number; h: number; l: number; c: number }[]; // downsampled bars for candlesticks
  advUsd: number;      // average daily traded value in USD, the liquidity input to capacity
  spreadBps: number;   // estimated quoted spread in basis points (Corwin-Schultz style proxy)
  /**
   * Undownsampled daily closes, for statistics rather than charts.
   *
   * `series` above is thinned to 260 points to keep chart payloads small, which is fine for a
   * line but starves every statistic downstream: on 260 bars the regime model finds barely a
   * dozen turbulent observations and a per-regime Sharpe on that is noise. Analytics read this
   * field instead. It is stripped at the /api/universe boundary so it never crosses the wire.
   */
  daily?: { dates: string[]; close: number[] };
}

export interface UniverseData {
  asOf: string;
  window: string;
  assets: AssetStats[];
  sectors: string[];
  correlation: { ids: string[]; matrix: number[][] };
  benchmarkReturn: number;
}
