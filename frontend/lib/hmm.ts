/**
 * Market regime detection with a 2-state Gaussian Hidden Markov Model.
 *
 * States: 0 = calm (low volatility), 1 = turbulent (high volatility). Parameters are fit by
 * Baum-Welch (EM) with scaled forward-backward for numerical stability, and the most likely
 * state path is decoded with Viterbi. This is the backbone of the regime-shift check: a backtest
 * trained mostly in one regime is fragile when live trading enters another.
 *
 * Everything is pure and deterministic given the input series, so results are reproducible.
 */

export interface RegimeModel {
  states: number[];          // Viterbi state per period (0 calm, 1 turbulent)
  dates: string[];
  transition: number[][];    // 2x2 transition probability matrix
  means: number[];           // per-state mean return
  vols: number[];            // per-state volatility
  stationary: number[];      // long-run state probabilities
  labels: string[];          // ["Calm", "Turbulent"]
  currentState: number;
  expectedDuration: number[]; // expected days in each state = 1/(1-a_ii)
}

const SQRT2PI = Math.sqrt(2 * Math.PI);
function gauss(x: number, mu: number, sigma: number): number {
  const s = Math.max(sigma, 1e-8);
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z) / (s * SQRT2PI);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function variance(xs: number[], mu: number): number {
  return xs.length > 1 ? xs.reduce((a, x) => a + (x - mu) ** 2, 0) / (xs.length - 1) : 1e-6;
}

export function detectRegimes(returns: number[], dates: string[], iterations = 40): RegimeModel {
  const K = 2;
  const T = returns.length;
  if (T < 20) {
    return {
      states: new Array(T).fill(0), dates, transition: [[0.9, 0.1], [0.1, 0.9]],
      means: [0, 0], vols: [0, 0], stationary: [0.5, 0.5], labels: ["Calm", "Turbulent"],
      currentState: 0, expectedDuration: [10, 10],
    };
  }

  // Initialise by splitting on the median absolute return (calm vs turbulent).
  const absSorted = [...returns].map(Math.abs).sort((a, b) => a - b);
  const thresh = absSorted[Math.floor(T / 2)];
  const calm = returns.filter((r) => Math.abs(r) <= thresh);
  const turb = returns.filter((r) => Math.abs(r) > thresh);
  let mu = [mean(calm), mean(turb)];
  let varr = [variance(calm, mu[0]), variance(turb, mu[1])];
  let pi = [0.5, 0.5];
  let A = [[0.95, 0.05], [0.1, 0.9]];

  const alpha = Array.from({ length: T }, () => [0, 0]);
  const beta = Array.from({ length: T }, () => [0, 0]);
  const gamma = Array.from({ length: T }, () => [0, 0]);
  const scale = new Array(T).fill(0);
  const xi = Array.from({ length: T - 1 }, () => [[0, 0], [0, 0]]);

  for (let iter = 0; iter < iterations; iter++) {
    // Emission probabilities.
    const B = returns.map((r) => [gauss(r, mu[0], Math.sqrt(varr[0])), gauss(r, mu[1], Math.sqrt(varr[1]))]);

    // Forward (scaled).
    scale[0] = 0;
    for (let k = 0; k < K; k++) { alpha[0][k] = pi[k] * B[0][k]; scale[0] += alpha[0][k]; }
    scale[0] = scale[0] || 1;
    for (let k = 0; k < K; k++) alpha[0][k] /= scale[0];
    for (let t = 1; t < T; t++) {
      scale[t] = 0;
      for (let k = 0; k < K; k++) {
        let s = 0;
        for (let j = 0; j < K; j++) s += alpha[t - 1][j] * A[j][k];
        alpha[t][k] = s * B[t][k];
        scale[t] += alpha[t][k];
      }
      scale[t] = scale[t] || 1;
      for (let k = 0; k < K; k++) alpha[t][k] /= scale[t];
    }

    // Backward (scaled).
    for (let k = 0; k < K; k++) beta[T - 1][k] = 1;
    for (let t = T - 2; t >= 0; t--) {
      for (let k = 0; k < K; k++) {
        let s = 0;
        for (let j = 0; j < K; j++) s += A[k][j] * B[t + 1][j] * beta[t + 1][j];
        beta[t][k] = s / scale[t + 1];
      }
    }

    // Gamma and xi.
    for (let t = 0; t < T; t++) {
      let norm = 0;
      for (let k = 0; k < K; k++) { gamma[t][k] = alpha[t][k] * beta[t][k]; norm += gamma[t][k]; }
      norm = norm || 1;
      for (let k = 0; k < K; k++) gamma[t][k] /= norm;
    }
    for (let t = 0; t < T - 1; t++) {
      let norm = 0;
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
        xi[t][i][j] = alpha[t][i] * A[i][j] * B[t + 1][j] * beta[t + 1][j];
        norm += xi[t][i][j];
      }
      norm = norm || 1;
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xi[t][i][j] /= norm;
    }

    // Re-estimate.
    pi = [gamma[0][0], gamma[0][1]];
    for (let i = 0; i < K; i++) {
      let denom = 0;
      for (let t = 0; t < T - 1; t++) denom += gamma[t][i];
      denom = denom || 1e-8;
      for (let j = 0; j < K; j++) {
        let s = 0;
        for (let t = 0; t < T - 1; t++) s += xi[t][i][j];
        A[i][j] = s / denom;
      }
    }
    for (let k = 0; k < K; k++) {
      let gsum = 0, msum = 0;
      for (let t = 0; t < T; t++) { gsum += gamma[t][k]; msum += gamma[t][k] * returns[t]; }
      gsum = gsum || 1e-8;
      mu[k] = msum / gsum;
      let vsum = 0;
      for (let t = 0; t < T; t++) vsum += gamma[t][k] * (returns[t] - mu[k]) ** 2;
      varr[k] = Math.max(vsum / gsum, 1e-8);
    }
  }

  // Ensure state 1 is the turbulent (higher variance) one.
  if (varr[0] > varr[1]) {
    mu = [mu[1], mu[0]]; varr = [varr[1], varr[0]];
    A = [[A[1][1], A[1][0]], [A[0][1], A[0][0]]];
    pi = [pi[1], pi[0]];
  }

  // Viterbi decode.
  const B = returns.map((r) => [gauss(r, mu[0], Math.sqrt(varr[0])), gauss(r, mu[1], Math.sqrt(varr[1]))]);
  const logA = A.map((row) => row.map((p) => Math.log(Math.max(p, 1e-12))));
  const delta = Array.from({ length: T }, () => [0, 0]);
  const psi = Array.from({ length: T }, () => [0, 0]);
  for (let k = 0; k < K; k++) delta[0][k] = Math.log(Math.max(pi[k], 1e-12)) + Math.log(Math.max(B[0][k], 1e-12));
  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      let best = -Infinity, arg = 0;
      for (let j = 0; j < K; j++) {
        const v = delta[t - 1][j] + logA[j][k];
        if (v > best) { best = v; arg = j; }
      }
      delta[t][k] = best + Math.log(Math.max(B[t][k], 1e-12));
      psi[t][k] = arg;
    }
  }
  const states = new Array(T).fill(0);
  states[T - 1] = delta[T - 1][1] > delta[T - 1][0] ? 1 : 0;
  for (let t = T - 2; t >= 0; t--) states[t] = psi[t + 1][states[t + 1]];

  // Stationary distribution from A (solve pi A = pi).
  const denom = 2 - A[0][0] - A[1][1] || 1e-8;
  const stationary = [(1 - A[1][1]) / denom, (1 - A[0][0]) / denom];

  return {
    states, dates, transition: A, means: mu, vols: varr.map((v) => Math.sqrt(v)),
    stationary, labels: ["Calm", "Turbulent"], currentState: states[T - 1],
    expectedDuration: [1 / Math.max(1 - A[0][0], 1e-6), 1 / Math.max(1 - A[1][1], 1e-6)],
  };
}

/** Contiguous same-state segments, for shading a chart. */
export function regimeSegments(model: RegimeModel): { start: number; end: number; state: number }[] {
  const segs: { start: number; end: number; state: number }[] = [];
  if (model.states.length === 0) return segs;
  let start = 0;
  for (let i = 1; i <= model.states.length; i++) {
    if (i === model.states.length || model.states[i] !== model.states[start]) {
      segs.push({ start, end: i - 1, state: model.states[start] });
      start = i;
    }
  }
  return segs;
}
