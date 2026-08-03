# LinkedIn caption

Video post. Paste as is: the bold is Unicode, so it survives LinkedIn's
plain-text editor.

Length: 2592 of the 3000 limit. 13 hashtags.

---

🎉 𝗠𝘆 𝗳𝗶𝗿𝘀𝘁 𝗾𝘂𝗮𝗻𝘁 𝗽𝗿𝗼𝗷𝗲𝗰𝘁 𝗶𝘀 𝗼𝘂𝘁, 𝗮𝗻𝗱 𝘁𝗵𝗲 𝘄𝗵𝗼𝗹𝗲 𝘁𝗵𝗶𝗻𝗴 𝘀𝗵𝗶𝗽𝘀 𝗮𝘀 𝗖𝗹𝗮𝘂𝗱𝗲 𝗦𝗸𝗶𝗹𝗹𝘀 𝘆𝗼𝘂 𝗰𝗮𝗻 𝗷𝘂𝘀𝘁 𝗶𝗻𝘀𝘁𝗮𝗹𝗹. Really pleased with this one 👇

It answers what backtests never tell you. Not "how good is this strategy". 𝗛𝗼𝘄 𝗺𝘂𝗰𝗵 𝗺𝗼𝗻𝗲𝘆 𝗰𝗮𝗻 𝗶𝘁 𝗮𝗰𝘁𝘂𝗮𝗹𝗹𝘆 𝗿𝘂𝗻. All open source, C++ engine included. ⚙️

🤖 𝗧𝗵𝗲 𝘀𝗸𝗶𝗹𝗹𝘀: four of them. strategy-builder, backtest-firewall, strategy-capacity, claim-auditor. No dependencies, no server, no keys. Drop a folder into .claude/skills and Claude will size a book, audit a backtest, rank a whole strategy family, or check whether someone's advertised track record is even internally consistent.

🖥️ 𝗧𝗵𝗲 𝘁𝗲𝗿𝗺𝗶𝗻𝗮𝗹: 11 pages, live data. 78 stocks, 36 other instruments, filings, macro series, 9 news feeds. No API keys, nothing paid.

📚 𝗧𝗵𝗲 𝗹𝗶𝗯𝗿𝗮𝗿𝘆: 20 anomalies from the literature, each one cited. Momentum, reversal, low vol, betting against beta, the MAX lottery effect, Amihud illiquidity, a few more. All walk forward, no look ahead.

📊 𝗖𝗮𝗽𝗮𝗰𝗶𝘁𝘆: here's what surprised me. My best Sharpe holds the least money. Reversal does 1.32 but trades 31x a year, so it caps out at $885M. Low vol does 0.94 and holds $1.28B. ⚠️

🧮 𝗥𝘂𝗻 𝘁𝗵𝗲𝗺 𝘁𝗼𝗴𝗲𝘁𝗵𝗲𝗿 𝗮𝗻𝗱 𝗶𝘁 𝗴𝗲𝘁𝘀 𝘄𝗼𝗿𝘀𝗲. Individually they add up to $13.2B. But they share 55 names, so a stock two strategies both want eats one day's volume twice over. Together they hold $1.5B. An 88% haircut almost nobody accounts for. ❌

🛡️ 𝗧𝗵𝗲 𝗳𝗶𝗿𝗲𝘄𝗮𝗹𝗹: PBO via CSCV, deflated Sharpe, Holm haircut, block bootstrap. I fed it pure random noise and it came back 97% overfit, which is exactly what it should do. ✅

🔬 𝗔𝗹𝗽𝗵𝗮 𝗼𝗿 𝗷𝘂𝘀𝘁 𝗯𝗲𝘁𝗮? I regressed all 20 against market, size, momentum, vol and reversal. R squared came back 75 to 93%. Not one hit a t stat of 2. Momentum loads 0.71 on the momentum factor with an alpha t of 0.40. So it isn't alpha on top of momentum. It just is momentum. 🔥

⚙️ 𝗔𝗹𝘀𝗼 𝗶𝗻 𝘁𝗵𝗲𝗿𝗲: Gaussian HMM for regime detection, a limit order book with proper price time priority, Loughran McDonald sentiment scoring the news.

⚠️ 𝗪𝗵𝗲𝗿𝗲 𝗜 𝗺𝗲𝘀𝘀𝗲𝗱 𝘂𝗽: I was thinning the price series to 260 points to keep the charts light, and every stat downstream quietly used that. PBO said 74%, overfit. I nearly posted it. Fixed the data path, sample went to 692, PBO dropped to 17%. My headline finding was my own bug. 🚨

👇 Repo's in the comments. Have a dig, tell me what I got wrong.

Follow Ahmed Raoofuddin (ARU) for more on quant infra and production AI. 🚀

#ClaudeAI #ClaudeSkills #QuantitativeFinance #SystematicTrading #AlgorithmicTrading #Backtesting #RiskManagement #AIEngineering #MachineLearning #DataScience #OpenSource #Cpp #FinTech

---

## First comment

github.com/AhmedRaoofuddin/Quant

## Notes

- Claude Skills sits in line one because that is the part people are actively looking for
  right now, and line one is the only line certain to show before "see more".
- Contractions and the "where I messed up" section are deliberate. A post that only lists
  wins reads like marketing; the bug is the most credible thing in it.
- Link in the first comment, never the body. LinkedIn throttles outbound links in posts.
- Upload the MP4 natively rather than linking it.
- Reply to comments in the first two hours. That window sets distribution.
