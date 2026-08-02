#include "alphaforge/dsl/AlphaLibrary.hpp"

namespace alphaforge::dsl {

const std::vector<std::string>& dsl_fields() {
    static const std::vector<std::string> fields = {
        "open", "high", "low", "close", "volume", "vwap", "returns", "dollar_volume"};
    return fields;
}

const std::vector<LibraryAlpha>& alpha_library() {
    static const std::vector<LibraryAlpha> library = {
        {"-1 * delta(close, 1)",
         "Short-term reversal: yesterday's winners tend to give back."},
        {"rank(ts_mean(returns, 5)) - rank(ts_mean(returns, 20))",
         "Fast-vs-slow momentum spread."},
        {"-1 * correlation(rank(close), rank(volume), 10)",
         "Price-volume divergence; breaks in the relationship signal reversals."},
        {"-1 * ts_rank(returns, 10)",
         "Medium-horizon reversal on the return rank."},
        {"rank(delta(volume, 1)) * -1 * sign(delta(close, 1))",
         "Volume shocks against the price move tend to fade."},
        {"zscore(ts_mean(returns, 20))",
         "Standardised medium-term momentum."},
        {"-1 * delta(vwap, 3)",
         "VWAP mean-reversion over a 3-day window."},
        {"rank(ts_std(returns, 20)) * -1",
         "Low-volatility anomaly: calmer names outperform."},
        {"correlation(close, ts_mean(close, 5), 10)",
         "Trend persistence measured against a moving average."},
        {"-1 * signedpower(delta(close, 5), 0.5)",
         "Damped 5-day reversal (square-root shrinks extremes)."},
        {"rank(dollar_volume) * sign(ts_mean(returns, 10))",
         "Liquidity-weighted momentum."},
        {"decay_linear(rank(returns), 5)",
         "Recency-weighted cross-sectional momentum."},
    };
    return library;
}

}  // namespace alphaforge::dsl
