# LinkedIn caption

Findings first, stack compressed into one block at the end.
Bold is Unicode so it survives LinkedIn.

Length: 2728 of 3000. 28 hashtags.

---

🎉 𝗠𝘆 𝗳𝗶𝗿𝘀𝘁 𝗾𝘂𝗮𝗻𝘁 𝗽𝗿𝗼𝗷𝗲𝗰𝘁 𝗶𝘀 𝗼𝘂𝘁. 𝗧𝘄𝗼 𝗼𝗳 𝗶𝘁𝘀 𝘀𝘁𝗿𝗮𝘁𝗲𝗴𝗶𝗲𝘀 𝘀𝗰𝗼𝗿𝗲 𝘁𝗵𝗲 𝘀𝗮𝗺𝗲 𝗦𝗵𝗮𝗿𝗽𝗲. 𝗢𝗻𝗲 𝗰𝗮𝗻 𝘁𝗮𝗸𝗲 $𝟲𝟭𝟯𝗠, 𝘁𝗵𝗲 𝗼𝘁𝗵𝗲𝗿 𝗰𝗮𝗻 𝘁𝗮𝗸𝗲 $𝟴𝗕 🚀

Sharpe says nothing about which is which. That number just does not get published.

📊 𝗪𝗵𝘆 𝘁𝗵𝗲 𝗴𝗮𝗽
The 1.84 trades 10x a year. The 1.71 trades 0.5x. Cost scales with turnover. Alpha does not.

🧮 𝗜𝘁 𝗴𝗲𝘁𝘀 𝘄𝗼𝗿𝘀𝗲 𝘄𝗵𝗲𝗻 𝘆𝗼𝘂 𝗿𝘂𝗻 𝗮𝗹𝗹 𝟮𝟬 𝗮𝘁 𝗼𝗻𝗰𝗲
Separately they add to $13.2B. But they share 57 names, so a stock two strategies both want eats one day of volume twice. Together: $1.5B. ❌

🤖 𝗔𝗹𝗹 𝗼𝗳 𝗶𝘁 𝘀𝗵𝗶𝗽𝘀 𝗮𝘀 𝗶𝗻𝘀𝘁𝗮𝗹𝗹𝗮𝗯𝗹𝗲 𝗖𝗹𝗮𝘂𝗱𝗲 𝗦𝗸𝗶𝗹𝗹𝘀
strategy-builder, backtest-firewall, strategy-capacity, claim-auditor. No dependencies, no server, no keys. Drop a folder into .claude/skills and Claude will size a book, audit a backtest, rank a strategy family, or check whether an advertised track record is even internally consistent. ⚙️

🔬 𝗔𝗹𝗽𝗵𝗮 𝗼𝗿 𝗷𝘂𝘀𝘁 𝗯𝗲𝘁𝗮
I regressed all 20 against market, size, momentum, vol and reversal. Not one produced alpha at a t stat of 2. R squared ran 37 to 93%. Momentum loads 0.80 on the momentum factor and its own alpha t is minus 1.75.

So it is not alpha on top of momentum. It just is momentum. 🔥

🛡️ 𝗧𝗵𝗲 𝗳𝗶𝗿𝗲𝘄𝗮𝗹𝗹
Overfitting via CSCV, deflated Sharpe, Holm haircut, block bootstrap. Pure random noise scores 97% overfit. The real library scores 17% across 252 splits. ✅

🌗 One Sharpe also hides two regimes. Momentum runs 0.81 when markets are calm and minus 1.70 when they are not.

⚠️ 𝗪𝗵𝗲𝗿𝗲 𝗜 𝗴𝗼𝘁 𝗶𝘁 𝘄𝗿𝗼𝗻𝗴
I was thinning the price series to 260 points to keep charts light, and every statistic downstream quietly used that. Overfitting read 74%. I nearly posted it. Fixed the data path, sample went to 692, it fell to 17%.

My headline finding was my own bug. 🚨

⚡ 𝗨𝗻𝗱𝗲𝗿 𝘁𝗵𝗲 𝗵𝗼𝗼𝗱
C++20 engine, Next.js terminal, Supabase with row level security, Docker
Almgren Chriss impact model, Newey West errors, Gaussian HMM with Viterbi decoding
A limit order book with real price time priority, Loughran McDonald sentiment
An alpha DSL that is parsed and validated, never evaluated as code
20 cited anomalies, walk forward, no look ahead
78 stocks, 36 cross asset instruments, filings, macro, 9 news feeds
51 tests, public data only, open source

👇 Repo in the comments. Have a dig and tell me what I got wrong.

Follow Ahmed Raoofuddin (ARU) for more on quant infra and production AI. 🚀

#ClaudeAI #ClaudeSkills #ClaudeCode #QuantitativeFinance #SystematicTrading #AlgorithmicTrading #QuantResearch #Backtesting #RiskManagement #PortfolioManagement #AIEngineering #MachineLearning #DataScience #CPlusPlus #NextJS #TypeScript #Supabase #MarketMicrostructure #FactorInvesting #Overfitting #Econometrics #FinTech #TradingSystems #OpenSource #BuildInPublic #FullStack #SoftwareEngineering #GitHub

---

## First comment

github.com/AhmedRaoofuddin/Quant

## Notes

- The stack sits at the end because the findings are what earn the scroll. A reader who
  stops halfway still got the point.
- Upload the MP4 natively rather than linking it.
- Every number is reproducible from the repo.
