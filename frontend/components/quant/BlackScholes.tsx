"use client";

import { useMemo } from "react";
import type { AssetStats } from "@/lib/quant-types";
import { Surface3D } from "./Surface3D";

// Black-Scholes call pricing on the selected asset's real volatility, with the classic option
// price surface over spot and time-to-maturity, plus the greeks.

const R = 0.043; // risk-free rate

function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return Math.sign(x) * y;
}
const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
const npdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

function bsCall(S: number, K: number, sigma: number, T: number) {
  if (T <= 0 || sigma <= 0) return { price: Math.max(0, S - K), delta: S > K ? 1 : 0, gamma: 0, vega: 0, theta: 0 };
  const d1 = (Math.log(S / K) + (R + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const price = S * N(d1) - K * Math.exp(-R * T) * N(d2);
  const delta = N(d1);
  const gamma = npdf(d1) / (S * sigma * Math.sqrt(T));
  const vega = (S * npdf(d1) * Math.sqrt(T)) / 100;
  const theta = (-(S * npdf(d1) * sigma) / (2 * Math.sqrt(T)) - R * K * Math.exp(-R * T) * N(d2)) / 365;
  return { price, delta, gamma, vega, theta };
}

/**
 * `variant` splits the two halves so each can sit in a row with cards of a similar height:
 * "greeks" is a compact stat block, "surface" is the wide 3D plot.
 */
export function BlackScholes({ asset, variant = "both" }: { asset: AssetStats; variant?: "both" | "greeks" | "surface" }) {
  const { atm, surface } = useMemo(() => {
    const S0 = asset.last, K = asset.last, sigma = asset.annVol;
    const atm = bsCall(S0, K, sigma, 1);
    const nS = 24, nT = 20;
    const z: number[][] = [];
    for (let ti = 0; ti < nT; ti++) {
      const T = 0.05 + (ti / (nT - 1)) * 1.95;
      const row: number[] = [];
      for (let si = 0; si < nS; si++) {
        const S = S0 * (0.6 + (si / (nS - 1)) * 0.8);
        row.push(bsCall(S, K, sigma, T).price);
      }
      z.push(row);
    }
    return { atm, surface: z };
  }, [asset]);

  return (
    <div className={variant === "both" ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" : "grid gap-3"}>
      {variant !== "surface" && (
        <div className="min-w-0 space-y-2.5">
          <div>
            <div className="eyebrow">ATM call · 1Y · σ {(asset.annVol * 100).toFixed(0)}%</div>
            <div className="t-metric mt-1 text-text">{atm.price.toFixed(2)}</div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-2.5">
            <G k="Delta" v={atm.delta.toFixed(3)} />
            <G k="Gamma" v={atm.gamma.toFixed(4)} />
            <G k="Vega" v={atm.vega.toFixed(3)} />
            <G k="Theta" v={atm.theta.toFixed(3)} />
          </div>
          <p className="pt-0.5 text-[11px] leading-relaxed text-faint">
            S = {asset.last.toFixed(0)}, K = {asset.last.toFixed(0)}, r = {(R * 100).toFixed(1)}%, priced on realised volatility.
          </p>
        </div>
      )}
      {variant !== "greeks" && (
        <div className="min-w-0">
          <Surface3D z={surface} zLabel="call $" wide />
        </div>
      )}
    </div>
  );
}

function G({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="eyebrow">{k}</span>
      <span className="mono truncate text-[13px] text-text">{v}</span>
    </div>
  );
}
