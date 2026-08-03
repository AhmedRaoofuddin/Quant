# LinkedIn caption

Video post. Paste as is: the bold is Unicode, so it survives LinkedIn's
plain-text editor.

Length: 2996 of the 3000 character limit.

---

📈 𝗜 𝗕𝘂𝗶𝗹𝘁 𝗮 𝗤𝘂𝗮𝗻𝘁 𝗧𝗲𝗿𝗺𝗶𝗻𝗮𝗹 𝗧𝗵𝗮𝘁 𝗔𝗻𝘀𝘄𝗲𝗿𝘀 𝘁𝗵𝗲 𝗤𝘂𝗲𝘀𝘁𝗶𝗼𝗻 𝗘𝘃𝗲𝗿𝘆 𝗕𝗮𝗰𝗸𝘁𝗲𝘀𝘁 𝗦𝗸𝗶𝗽𝘀

My first ever quant project is live and I am genuinely thrilled with it. The entire C++ codebase is open source in the comments, and that is the part I love most. 🎉

Not "how good is this strategy". 𝗛𝗼𝘄 𝗺𝘂𝗰𝗵 𝗺𝗼𝗻𝗲𝘆 𝗰𝗮𝗻 𝗶𝘁 𝗮𝗰𝘁𝘂𝗮𝗹𝗹𝘆 𝗿𝘂𝗻. 👇

🖥️ 𝗧𝗵𝗲 𝘁𝗲𝗿𝗺𝗶𝗻𝗮𝗹: 11 pages on live market data. 78 equities, 36 cross asset instruments, filings, macro series and 9 news feeds. Public sources only, no API keys, no paid feed.

📚 𝗧𝗵𝗲 𝘀𝘁𝗿𝗮𝘁𝗲𝗴𝘆 𝗹𝗶𝗯𝗿𝗮𝗿𝘆: 20 documented anomalies, each with its citation. Momentum, residual momentum, 52 week high, reversal, low and idiosyncratic volatility, betting against beta, the MAX lottery effect, skewness, trend, breakout, Amihud illiquidity. All walk forward, no look ahead.

📊 𝗧𝗵𝗲 𝗰𝗮𝗽𝗮𝗰𝗶𝘁𝘆 𝗲𝗻𝗴𝗶𝗻𝗲: square root market impact. Every strategy reports the size it carries, not just its Sharpe. My best Sharpe carries the least money. Reversal posts 1.32 and saturates at $885M because it trades 31x a year. Low volatility posts 0.94 and carries $1.28B. ⚠️

🧮 𝗝𝗼𝗶𝗻𝘁 𝗰𝗮𝗽𝗮𝗰𝗶𝘁𝘆: sized alone the 20 strategies sum to $13.2B. Run together they share 55 names, so a stock two strategies both want carries both positions against one day of volume. The blend carries $1.5B. An 88% overlap tax. ❌

🛡️ 𝗧𝗵𝗲 𝗼𝘃𝗲𝗿𝗳𝗶𝘁𝘁𝗶𝗻𝗴 𝗳𝗶𝗿𝗲𝘄𝗮𝗹𝗹: PBO via CSCV, deflated Sharpe, a Holm Bonferroni haircut and a block bootstrap. Point it at eight series of pure noise and it returns 97% PBO. A firewall that passes noise is worthless. ✅

🔬 𝗔𝗹𝗽𝗵𝗮 𝗮𝘁𝘁𝗿𝗶𝗯𝘂𝘁𝗶𝗼𝗻: all 20 regressed on market, size, momentum, volatility and reversal factors with Newey West errors. R squared 75 to 93%. Zero cleared a t stat of 2 on alpha. Momentum loads 0.71 on the momentum factor with an alpha t of 0.40. It is not alpha on top of momentum. It is momentum. 🔥

⚙️ 𝗔𝗻𝗱 𝘁𝗵𝗲 𝗿𝗲𝘀𝘁: a Gaussian HMM with Baum Welch and Viterbi for regimes, a limit order book with price time priority matching, and Loughran McDonald sentiment on the news desk.

🤖 𝗧𝗵𝗲 𝗽𝗮𝗿𝘁 𝗜 𝗮𝗺 𝗽𝗿𝗼𝘂𝗱𝗲𝘀𝘁 𝗼𝗳: I shipped the engines as installable Claude Skills. Plain Node, zero dependencies, no server, no keys. Copy a folder and Claude can size a book, audit a backtest, or rank a whole strategy family for you.

⚠️ 𝗧𝗵𝗲 𝗽𝗮𝗿𝘁 𝘁𝗵𝗮𝘁 𝗯𝗶𝘁 𝗺𝗲 𝗶𝗻 𝗽𝗿𝗼𝗱𝘂𝗰𝘁𝗶𝗼𝗻:

The price series was thinned to 260 points for chart payloads and every statistic quietly inherited it. Family PBO read 74%, overfit. I nearly shipped that. Fixed the data path, sample rose to 692 periods, PBO fell to 17%, robust. My headline was an artefact of my own downsampling. 🚨

💡 One Sharpe hides two regimes. Momentum runs 0.81 in calm markets, minus 1.70 in turbulent ones.

🎯 Print capacity next to every Sharpe you publish. I would rather ship that than a curve that looks too good.

👇 Codebase in the comments. Clone it, run it, tell me where I am wrong.

Follow Ahmed Raoofuddin (ARU) for deep dives on quant infra and production AI. 🚀

#QuantitativeFinance #SystematicTrading #AIEngineering #RiskManagement #OpenSource #Cpp

---

## First comment

github.com/AhmedRaoofuddin/Quant

## Notes

- Bold uses the Mathematical Sans-Serif Bold block. Renders everywhere, but screen readers
  read it character by character, so it does cost accessibility.
- Link in the first comment, never in the body. LinkedIn throttles outbound links in posts.
- Upload the MP4 natively rather than linking it.
- Only the first three lines show before "see more".
- Reply to comments in the first two hours. That window sets distribution.
- Every figure is reproducible from the repo, so point challengers there.
