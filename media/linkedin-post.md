# LinkedIn caption

Project writeup format. Paste as is, then retype each @name in the
composer and pick the company from the dropdown, otherwise they stay plain text.

Length: 2995 of 3000 as LinkedIn counts it (2872 characters). 26 hashtags.
LinkedIn counts UTF-16 units, so every bold character and emoji costs 2, not 1.

---

𝗤𝗨𝗔𝗡𝗧 𝗣𝗥𝗢𝗝𝗘𝗖𝗧 𝟭 | 𝗠𝘆 𝗙𝗶𝗿𝘀𝘁 𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝗮𝘁𝗶𝘃𝗲 𝗥𝗲𝘀𝗲𝗮𝗿𝗰𝗵 𝗧𝗲𝗿𝗺𝗶𝗻𝗮𝗹 𝗶𝗻 𝗖++

I'm excited to share my first project in quantitative finance, and I finally got to put C++ next to what I know about markets 📈

I built Alpha-Forge, a research terminal that answers the question almost every backtest skips. Not how good a strategy is, but how much money it can actually run before its own market impact eats the edge. It backtests 20 documented anomalies on live prices, sizes each against real liquidity, then checks whether the results are real.

🛠️ 𝗧𝗲𝗰𝗵𝗻𝗼𝗹𝗼𝗴𝗶𝗲𝘀 𝗮𝗻𝗱 𝗰𝗼𝗻𝗰𝗲𝗽𝘁𝘀 𝘂𝘀𝗲𝗱:
• C++20 core engine, clean hexagonal architecture
• Next.js 14 and TypeScript terminal, 11 pages
• Supabase Postgres with row level security
• CMake, Ninja, Docker Compose
• @Anthropic Claude Skills for packaging the engines
• Yahoo Finance, SEC EDGAR, FRED, CoinGecko, Wikidata

📐 𝗠𝗼𝗱𝗲𝗹𝘀 𝘂𝘀𝗲𝗱:
• Almgren Chriss square root market impact with a participation cap
• CSCV probability of backtest overfitting, deflated Sharpe, Holm haircut
• Factor attribution with Newey West standard errors
• Two state Gaussian HMM, Baum Welch and Viterbi, for regimes
• Limit order book with price time priority matching
• GBM Monte Carlo, Black Scholes greeks, a volatility surface

This is how the funds actually work. @Citadel and @Millennium size every pod against its own liquidity, then manage crowding where pods overlap. @AQR Capital Management and @Two Sigma publish the research others trade. Betting against beta is Frazzini and Pedersen at AQR.

✅ 𝗪𝗵𝗮𝘁 𝘁𝗵𝗲 𝗽𝗿𝗼𝗷𝗲𝗰𝘁 𝗱𝗼𝗲𝘀:
✅ Backtests 20 cited anomalies walk forward, no look ahead
✅ Reports the capital each one carries, not just its Sharpe
✅ Measures joint capacity once strategies share names
✅ Separates real alpha from repackaged factor exposure
✅ Flags overfitting before you trust a result
✅ Ships all four engines as installable Claude Skills

💡 𝗞𝗲𝘆 𝘁𝗮𝗸𝗲𝗮𝘄𝗮𝘆𝘀:

Two strategies score the same Sharpe. One takes $613M, the other $8B. The difference is turnover, not signal quality.

Run all 20 together and their capacities do not add. $13.2B separately, $1.5B combined, because they share 57 names.

And the uncomfortable one: not a single strategy produced alpha at a t stat of 2 once I adjusted for factor exposure. Momentum is not alpha on top of momentum. It just is momentum.

I also got it wrong once. I was thinning the price series for charts and every statistic quietly used it. Overfitting read 74%. Fixed it and it fell to 17%. My headline was my own bug.

👇 Repo in the first comment.

#AI #Quant #QuantitativeFinance #SystematicTrading #AlgorithmicTrading #HedgeFunds #Backtesting #RiskManagement #MachineLearning #DataScience #ClaudeAI #ClaudeSkills #MarketImpact #FactorInvesting #Overfitting #Econometrics #MonteCarlo #FinTech #TradingSystems #CPlusPlus #TypeScript #OpenSource #BuildInPublic #GitHub #AIEngineering #MarketMicrostructure

---

## First comment

https://github.com/AhmedRaoofuddin/Quant
