import type { EvaluatedAlpha } from "@/lib/types";
import { fmtNumber, fmtPercent } from "@/lib/format";

// Alpha blotter: dense monospace grid, green/red on the numbers, ranked by deflated Sharpe.

function num(x: number, digits = 2) {
  const s = fmtNumber(x, digits);
  return <span className={`mono ${x > 0 ? "pos" : x < 0 ? "neg" : "text-muted"}`}>{x > 0 ? "+" : ""}{s}</span>;
}

export function AlphaLeaderboard({ alphas }: { alphas: EvaluatedAlpha[] }) {
  const rows = [...alphas].sort((a, b) => b.in_sample.deflated_sharpe - a.in_sample.deflated_sharpe);

  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="blotter">
        <thead>
          <tr>
            <th>Alpha</th>
            <th>Src</th>
            <th>IS Shrp</th>
            <th>OOS Shrp</th>
            <th>DSR</th>
            <th>IC</th>
            <th>Turn</th>
            <th>Risk</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const oos = a.out_sample?.sharpe ?? 0;
            return (
              <tr key={a.expression.id} className="grid-row">
                <td className="text-left">
                  <span className="mono text-[11.5px] text-text" title={a.expression.rationale}>
                    <span className={`mr-1.5 ${a.selected ? "text-green" : "text-faint"}`}>{a.selected ? "▮" : "▯"}</span>
                    {a.expression.expression}
                  </span>
                </td>
                <td className="text-right">
                  <span className={`mono text-[10px] uppercase ${a.expression.proposed_by === "llm" ? "text-cyan" : "text-faint"}`}>
                    {a.expression.proposed_by}
                  </span>
                </td>
                <td className="text-right">{num(a.in_sample.sharpe)}</td>
                <td className={`text-right ${oos > 0 ? "pos-bg" : oos < 0 ? "neg-bg" : ""}`}>{num(oos)}</td>
                <td className="text-right"><span className="mono text-muted">{fmtNumber(a.in_sample.deflated_sharpe)}</span></td>
                <td className="text-right"><span className="mono text-muted">{fmtNumber(a.in_sample.ic_mean, 3)}</span></td>
                <td className="text-right"><span className="mono text-muted">{fmtPercent(a.in_sample.turnover, 0)}</span></td>
                <td className="text-right"><span className="mono text-muted">{fmtNumber(a.risk_score)}</span></td>
                <td className="text-right">
                  {a.selected ? (
                    <span className="mono text-[10px] font-semibold text-green">SEL</span>
                  ) : (
                    <span className="mono text-[10px] text-faint" title={a.reject_reason}>REJ</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
