"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listRunIds } from "@/lib/data";
import { Panel } from "@/components/Panel";

export default function RunsPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    listRunIds().then((r) => { setIds(r); setState("ready"); }).catch(() => setState("error"));
  }, []);

  return (
    <Panel title="Discovery runs" accent="blue" bodyClass="p-0" right={`${ids.length} on record`}>
      {state === "error" && <p className="p-3 text-xs text-red">Engine unreachable.</p>}
      {state === "ready" && ids.length === 0 && <p className="p-3 text-xs text-muted">No runs yet.</p>}
      {state === "ready" && (
        <table className="blotter">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Timestamp (UTC)</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const ts = id.match(/(\d{8})T?(\d{6})/);
              const stamp = ts ? `${ts[1].slice(0, 4)}-${ts[1].slice(4, 6)}-${ts[1].slice(6, 8)} ${ts[2].slice(0, 2)}:${ts[2].slice(2, 4)}:${ts[2].slice(4, 6)}` : "—";
              return (
                <tr key={id} className="grid-row">
                  <td className="text-left"><Link href={`/runs/${id}`} className="mono text-[11.5px] text-blue hover:underline">{id}</Link></td>
                  <td className="text-right mono text-muted">{stamp}</td>
                  <td className="text-right"><Link href={`/runs/${id}`} className="text-muted hover:text-text">→</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
