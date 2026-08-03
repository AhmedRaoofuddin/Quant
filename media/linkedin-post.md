# LinkedIn caption

Video post. Paste as is: the bold is Unicode, so it survives LinkedIn's
plain-text editor.

Length: 2451 of the 3000 limit. 13 hashtags.
All figures verified against /api/strategies on the 692-period series.

---

🎯 𝗧𝗵𝗲 𝗡𝘂𝗺𝗯𝗲𝗿 𝗘𝘃𝗲𝗿𝘆 𝗕𝗮𝗰𝗸𝘁𝗲𝘀𝘁 𝗛𝗶𝗱𝗲𝘀, 𝗮𝗻𝗱 𝘁𝗵𝗲 𝗧𝗲𝗿𝗺𝗶𝗻𝗮𝗹 𝗜 𝗕𝘂𝗶𝗹𝘁 𝘁𝗼 𝗘𝘅𝗽𝗼𝘀𝗲 𝗜𝘁

Two strategies in my library score almost the same Sharpe. 1.84 and 1.71. One of them can hold $613M. The other can hold $8B.

Everyone reports Sharpe. Almost nobody reports the capital it survives. That gap is where funds blow up. 👇

🎉 This is my first quant project, and the whole thing ships as installable Claude Skills. All open source, C++ engine included.

🤖 𝗧𝗵𝗲 𝘀𝗸𝗶𝗹𝗹𝘀: strategy-builder, backtest-firewall, strategy-capacity, claim-auditor. No dependencies, no server, no keys. Drop a folder into .claude/skills and Claude will size a book, audit a backtest, rank a strategy family, or check whether someone's advertised track record is even internally consistent.

📊 𝗪𝗵𝘆 𝘁𝗵𝗼𝘀𝗲 𝘁𝘄𝗼 𝗱𝗶𝗳𝗳𝗲𝗿: the 1.84 trades 10x a year. The 1.71 trades 0.5x. Cost scales with turnover, alpha does not. Same Sharpe, 13x the capacity. ⚠️

🧮 𝗥𝘂𝗻 𝗮𝗹𝗹 𝟮𝟬 𝘁𝗼𝗴𝗲𝘁𝗵𝗲𝗿 𝗮𝗻𝗱 𝗶𝘁 𝗴𝗲𝘁𝘀 𝘄𝗼𝗿𝘀𝗲. Individually they add up to $13.2B. But they share 57 names, so a stock two strategies both want eats one day's volume twice over. Together they hold $1.5B. An 88% haircut almost nobody accounts for. ❌

🛡️ 𝗧𝗵𝗲 𝗳𝗶𝗿𝗲𝘄𝗮𝗹𝗹: PBO via CSCV, deflated Sharpe, Holm haircut, block bootstrap. I fed it pure random noise and it came back 97% overfit, which is exactly what it should do. ✅

🔬 𝗔𝗹𝗽𝗵𝗮 𝗼𝗿 𝗷𝘂𝘀𝘁 𝗯𝗲𝘁𝗮? I regressed all 20 against market, size, momentum, vol and reversal. R squared came back 37 to 93%. Not one hit a t stat of 2. Momentum loads 0.80 on the momentum factor and its own alpha t is minus 1.75. It isn't alpha on top of momentum. It just is momentum. 🔥

🖥️ 𝗧𝗵𝗲 𝘁𝗲𝗿𝗺𝗶𝗻𝗮𝗹: 11 pages, live data. 78 stocks, 36 other instruments, filings, macro series, 9 news feeds. Plus a Gaussian HMM for regimes, a limit order book with proper price time priority, and Loughran McDonald sentiment on the news desk.

⚠️ 𝗪𝗵𝗲𝗿𝗲 𝗜 𝗺𝗲𝘀𝘀𝗲𝗱 𝘂𝗽: I was thinning the price series to 260 points to keep charts light, and every stat downstream quietly used that. PBO said 74%, overfit. I nearly posted it. Fixed the data path, sample went to 692, PBO dropped to 17%. My headline finding was my own bug. 🚨

👇 Repo's in the comments. Have a dig, tell me what I got wrong.

Follow Ahmed Raoofuddin (ARU) for more on quant infra and production AI. 🚀

#ClaudeAI #ClaudeSkills #QuantitativeFinance #SystematicTrading #AlgorithmicTrading #Backtesting #RiskManagement #AIEngineering #MachineLearning #DataScience #OpenSource #Cpp #FinTech

---

## First comment

github.com/AhmedRaoofuddin/Quant

## Notes

- Structure follows the reference post: line 1 is a title, line 2 is the counterintuitive
  claim, line 3 names the gap and hands off with an arrow.
- The personal note and Claude Skills come straight after the hook, not before it. A hook
  earns the attention that an announcement then gets to use.
- Link in the first comment, never the body. LinkedIn throttles outbound links in posts.
- Upload the MP4 natively rather than linking it.
- Reply to comments in the first two hours. That window sets distribution.
