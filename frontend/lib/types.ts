// Mirrors the backend's DiscoveryRun JSON (domain/Serialization.cpp).

export interface AlphaExpression {
  id: string;
  expression: string;
  rationale: string;
  proposed_by: string;
  created_at: string;
}

export interface AlphaMetrics {
  alpha_id: string;
  sharpe: number;
  ann_return: number;
  ann_vol: number;
  max_drawdown: number;
  turnover: number;
  ic_mean: number;
  ic_ir: number;
  n_obs: number;
  deflated_sharpe: number;
}

export interface EvaluatedAlpha {
  expression: AlphaExpression;
  in_sample: AlphaMetrics;
  out_sample: AlphaMetrics | null;
  selected: boolean;
  reject_reason: string;
  risk_score: number;
}

export interface Allocation {
  weights: Record<string, number>;
  method: string;
  expected_sharpe: number;
}

export interface BacktestResult {
  metrics: AlphaMetrics;
  dates: string[];
  equity_curve: number[];
  allocation: Allocation;
}

/** Overfitting & leakage diagnostics (the core differentiator). */
export interface ValidationReport {
  pbo: number;                 // Probability of Backtest Overfitting, [0,1] (López de Prado, CSCV)
  n_trials: number;            // strategies stress-tested together
  n_splits: number;            // S submatrices used by CSCV
  n_combinations: number;      // C(S, S/2) train/test splits evaluated
  lambdas: number[];           // rank-logit per split (histogram input); λ<=0 means overfit
  perf_degradation: number;    // OLS slope of OOS vs IS Sharpe (1 = no decay, <0 = inverted)
  best_alpha_id: string;       // most frequently best in-sample
  min_backtest_years: number;  // Minimum Backtest Length for the best alpha at PSR 0.95
  haircut_sharpe: number;      // Harvey-Liu multiple-testing-adjusted Sharpe (Holm) for best alpha
  haircut_pct: number;         // fraction of the best alpha's Sharpe lost to multiple testing
  sharpe_ci: [number, number]; // 95% block-bootstrap CI on the best alpha's Sharpe
  effective_trials: number;    // independent-trial count from return-correlation structure
  leakage_flags: string[];     // automated look-ahead / hygiene warnings
  per_alpha: { alpha_id: string; psr: number; dsr: number }[]; // Probabilistic + Deflated Sharpe
  verdict: "robust" | "fragile" | "overfit";
}

export interface RegimeModelData {
  states: number[];
  dates: string[];
  transition: number[][];
  means: number[];
  vols: number[];
  stationary: number[];
  labels: string[];
  currentState: number;
  expectedDuration: number[];
}

export interface DiscoveryRun {
  run_id: string;
  universe: string[];
  start_date: string;
  end_date: string;
  n_proposed: number;
  n_selected: number;
  alphas: EvaluatedAlpha[];
  result: BacktestResult | null;
  validation: ValidationReport | null;
  factor_correlation: { ids: string[]; matrix: number[][] } | null;
  regimes: RegimeModelData | null;
  region: string;
  started_at: string;
  finished_at: string;
}

export interface LibraryAlpha {
  expression: string;
  rationale: string;
}
