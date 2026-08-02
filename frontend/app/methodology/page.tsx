import { Panel } from "@/components/Panel";

const METHODS = [
  {
    tag: "PBO",
    title: "Probability of Backtest Overfitting (CSCV)",
    body: "Combinatorially-Symmetric Cross-Validation splits the return history into S blocks and evaluates every train/test combination. PBO is the fraction of splits in which the alpha that looked best in-sample falls below the out-of-sample median. High PBO means the selection process is fitting noise.",
    ref: "Bailey, Borwein, López de Prado, Zhu (2015)",
  },
  {
    tag: "DSR",
    title: "Deflated Sharpe Ratio",
    body: "The more strategies you try, the higher the best Sharpe you will find by pure luck. DSR corrects the observed Sharpe for the number of trials, the sample length, and the return distribution's skew and kurtosis, returning the probability the true Sharpe exceeds zero.",
    ref: "Bailey & López de Prado (2014)",
  },
  {
    tag: "PSR",
    title: "Probabilistic Sharpe Ratio",
    body: "Given a track record of length T with non-normal returns, PSR is the confidence that the Sharpe beats a benchmark. Paired with Minimum Backtest Length, it answers: how long a record do you need before this Sharpe is believable?",
    ref: "Bailey & López de Prado (2012)",
  },
  {
    tag: "HAIRCUT",
    title: "Multiple-Testing Haircut",
    body: "Each alpha's Sharpe becomes a t-statistic; the family of p-values is adjusted (Holm step-down) so the best alpha's Sharpe is discounted for how many alphas were tried. The haircut is the percentage of Sharpe that does not survive the correction.",
    ref: "Harvey & Liu (2015)",
  },
  {
    tag: "BOOTSTRAP",
    title: "Block-Bootstrap Confidence Interval",
    body: "Resampling contiguous blocks of returns preserves autocorrelation while generating a distribution of Sharpe ratios, yielding a 95% confidence interval. A CI that straddles zero is a red flag no point estimate would reveal.",
    ref: "Politis & Romano (1994)",
  },
  {
    tag: "LEAK-FREE",
    title: "Leak-Free Backtest by Construction",
    body: "The feature builder pre-shifts the forward-return target, so a signal decided on day t can only ever meet the return from t to t+1. There is no path by which contemporaneous or future information reaches a weight. The leakage scan additionally flags implausible Sharpes and cost-hiding turnover.",
    ref: "López de Prado, Advances in Financial ML (2018)",
  },
];

export default function MethodologyPage() {
  return (
    <div className="space-y-2.5">
      <Panel title="Methodology" accent="blue">
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          Generating strategies is cheap and getting cheaper. The hard, valuable question is whether a backtest is real
          or an artefact of searching too hard. Alpha-Forge runs the full academic battery for that question, so every
          number on the terminal is defensible. Each method below is applied automatically to every discovery run.
        </p>
      </Panel>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {METHODS.map((m) => (
          <div key={m.tag} className="panel p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-sm border border-blue/40 bg-blue/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-blue">{m.tag}</span>
              <h3 className="text-[13.5px] font-semibold text-text">{m.title}</h3>
            </div>
            <p className="text-[12px] leading-relaxed text-muted">{m.body}</p>
            <p className="mt-2 mono text-[10px] text-faint">{m.ref}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
