# LinkedIn caption

Tech stack showcase format. Plain text, paste as is.

Length: 2924 of 3000. 40 hashtags. Figures verified against the live API.

---

I'm excited to share what I've been building 🚀

Alpha-Forge a quantitative research terminal that answers the question every backtest skips. Not how good a strategy is, but how much money it can actually run before its own market impact eats the edge. Public data only. No API keys, no paid terminal.

The full tech stack:
⚡ C++20 for the core engine, clean hexagonal architecture
⚡ Next.js 14 and TypeScript for the research terminal
⚡ Tailwind CSS for the interface
⚡ Supabase Postgres with row level security
⚡ CMake and Ninja for the build
⚡ Docker Compose for dev, test and prod
⚡ Claude Skills for packaging the engines
⚡ Yahoo Finance, SEC EDGAR, FRED, CoinGecko and Wikidata as sources

What's actually inside:
• Almgren Chriss square root market impact model with participation caps
• Joint capacity optimiser measuring the overlap tax across a multi strategy book
• Long only max Sharpe allocator by projected gradient with shrunk covariance
• Probability of backtest overfitting via combinatorially symmetric cross validation
• Deflated and probabilistic Sharpe ratios
• Holm Bonferroni multiple testing haircut
• Circular block bootstrap for Sharpe confidence intervals
• Factor attribution with Newey West standard errors
• Two state Gaussian HMM with Baum Welch training and Viterbi decoding
• Limit order book with price time priority matching
• Loughran McDonald sentiment lexicon with negation handling
• Sandboxed alpha DSL, parsed and validated, never evaluated as code
• 20 documented anomalies from the literature, walk forward, no look ahead
• Track record auditor that checks advertised claims for contradictions
• Threaded RSS crawler across 9 finance feeds
• Typed exception hierarchy mapped to exit codes and HTTP statuses
• 51 unit and property tests

This is full stack quant engineering. C++ numerics, statistical validation, a research terminal, and four installable Claude Skills working together.

Two findings that surprised me. Two strategies score the same Sharpe, one holds $613M and the other $8B, purely on turnover. And run all 20 together and their capacities do not add up: $13.2B separately, $1.5B combined, because they share 57 names.

The demo below shows the full flow, screening the universe, comparing 20 strategies against their capacity, and the overfitting verdict.

Explore the code 👇

https://github.com/AhmedRaoofuddin/Quant

#AI #Quant #QuantitativeFinance #SystematicTrading #AlgorithmicTrading #Backtesting #RiskManagement #PortfolioManagement #MachineLearning #DataScience #CPlusPlus #Cpp20 #NextJS #TypeScript #TailwindCSS #Supabase #PostgreSQL #Docker #ClaudeAI #ClaudeSkills #ClaudeCode #MarketMicrostructure #OrderBook #HiddenMarkovModel #FactorInvesting #AlphaResearch #MarketImpact #Overfitting #Statistics #Econometrics #FinTech #TradingSystems #OpenSource #BuildInPublic #FullStack #SoftwareEngineering #SoftwareArchitecture #GitHub #Developer #AIEngineering

---

## Notes

- This format puts the link in the body, matching the reference post. That does cost some
  reach versus putting it in the first comment, but it keeps the flow intact.
- Upload the MP4 natively rather than linking it.
- Every number is reproducible from the repo.
