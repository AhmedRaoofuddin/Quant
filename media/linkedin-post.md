# LinkedIn caption

Video post. Paste as is: the bold is Unicode, so it survives LinkedIn's
plain-text editor.

Length: 2785 of the 3000 character limit. 13 hashtags.

---

🎉 𝗠𝘆 𝗳𝗶𝗿𝘀𝘁 𝗲𝘃𝗲𝗿 𝗾𝘂𝗮𝗻𝘁 𝗽𝗿𝗼𝗷𝗲𝗰𝘁 𝗶𝘀 𝗹𝗶𝘃𝗲 𝗮𝗻𝗱 𝗜 𝗮𝗺 𝗯𝘂𝘇𝘇𝗶𝗻𝗴! I built a terminal that answers the question every backtest skips 👇

Not "how good is this strategy". 𝗛𝗼𝘄 𝗺𝘂𝗰𝗵 𝗺𝗼𝗻𝗲𝘆 𝗰𝗮𝗻 𝗶𝘁 𝗮𝗰𝘁𝘂𝗮𝗹𝗹𝘆 𝗿𝘂𝗻. And the entire C++ codebase is open source, which is the part I love most. ⚙️

🖥️ 𝗧𝗵𝗲 𝘁𝗲𝗿𝗺𝗶𝗻𝗮𝗹: 11 pages on live data. 78 equities, 36 cross asset instruments, filings, macro series and 9 news feeds. No API keys, no paid feed.

📚 𝗧𝗵𝗲 𝗹𝗶𝗯𝗿𝗮𝗿𝘆: 20 documented anomalies with citations. Momentum, residual momentum, 52 week high, reversal, low and idiosyncratic vol, betting against beta, the MAX lottery effect, skewness, trend, breakout, Amihud illiquidity. All walk forward, no look ahead.

📊 𝗧𝗵𝗲 𝗰𝗮𝗽𝗮𝗰𝗶𝘁𝘆 𝗲𝗻𝗴𝗶𝗻𝗲: square root market impact. Every strategy reports the size it carries, not just its Sharpe. My best Sharpe carries the least money. Reversal posts 1.32 and saturates at $885M because it trades 31x a year. Low vol posts 0.94 and carries $1.28B. ⚠️

🧮 𝗝𝗼𝗶𝗻𝘁 𝗰𝗮𝗽𝗮𝗰𝗶𝘁𝘆: sized alone the 20 sum to $13.2B. Run together they share 55 names, so a stock two strategies both want carries both positions against one day of volume. The blend carries $1.5B. An 88% overlap tax. ❌

🛡️ 𝗧𝗵𝗲 𝗼𝘃𝗲𝗿𝗳𝗶𝘁𝘁𝗶𝗻𝗴 𝗳𝗶𝗿𝗲𝘄𝗮𝗹𝗹: PBO via CSCV, deflated Sharpe, a Holm haircut and a block bootstrap. Point it at pure noise and it returns 97% PBO. A firewall that passes noise is worthless. ✅

🔬 𝗔𝗹𝗽𝗵𝗮 𝗮𝘁𝘁𝗿𝗶𝗯𝘂𝘁𝗶𝗼𝗻: all 20 regressed on market, size, momentum, vol and reversal factors with Newey West errors. R squared 75 to 93%. Zero cleared a t stat of 2 on alpha. Momentum loads 0.71 on the momentum factor with an alpha t of 0.40. It is not alpha on top of momentum. It is momentum. 🔥

⚙️ 𝗣𝗹𝘂𝘀: a Gaussian HMM for regimes, a limit order book with price time priority matching, and Loughran McDonald sentiment on the news desk.

🤖 𝗣𝗿𝗼𝘂𝗱𝗲𝘀𝘁 𝗽𝗮𝗿𝘁: I shipped the engines as installable Claude Skills. Zero dependencies, no server, no keys. Copy a folder and Claude can size a book, audit a backtest, or rank a whole strategy family.

⚠️ 𝗧𝗵𝗲 𝗽𝗮𝗿𝘁 𝘁𝗵𝗮𝘁 𝗯𝗶𝘁 𝗺𝗲: the price series was thinned to 260 points for chart payloads and every statistic inherited it. PBO read 74%, overfit. Fixed the data path, sample rose to 692 periods, PBO fell to 17%, robust. My headline was an artefact of my own downsampling. 🚨

💡 One Sharpe hides two regimes. Momentum runs 0.81 in calm markets, minus 1.70 in turbulent ones.

🎯 Print capacity next to every Sharpe you publish.

👇 Codebase in the comments. Clone it, run it, tell me where I am wrong.

Follow Ahmed Raoofuddin (ARU) for deep dives on quant infra and production AI. 🚀

#QuantitativeFinance #SystematicTrading #AlgorithmicTrading #Backtesting #RiskManagement #PortfolioManagement #AIEngineering #MachineLearning #DataScience #OpenSource #Cpp #FinTech #SoftwareEngineering

---

## First comment

github.com/AhmedRaoofuddin/Quant

## Notes

- Excitement and the hook are both in line one, which is the only line guaranteed to show
  before "see more".
- Bold uses the Mathematical Sans-Serif Bold block. Renders everywhere, but screen readers
  read it character by character, so it does cost accessibility.
- Link in the first comment, never in the body. LinkedIn throttles outbound links in posts.
- Upload the MP4 natively rather than linking it.
- Reply to comments in the first two hours. That window sets distribution.
- Every figure is reproducible from the repo, so point challengers there.
