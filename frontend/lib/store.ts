// In-memory run store for the Next.js API routes. Seeded with one real computed run on first
// access so the dashboard is populated immediately. The C++ backend uses durable repositories;
// this is the standalone dev/demo store.

import { runDiscovery } from "./engine";
import type { DiscoveryRun } from "./types";

type Store = { runs: Map<string, DiscoveryRun>; order: string[] };

const g = globalThis as unknown as { __afStore?: Store };

function store(): Store {
  if (!g.__afStore) {
    g.__afStore = { runs: new Map(), order: [] };
    const seed = runDiscovery(42, 12); // one genuine run so the UI is never empty
    g.__afStore.runs.set(seed.run_id, seed);
    g.__afStore.order.unshift(seed.run_id);
  }
  return g.__afStore;
}

export function addRun(run: DiscoveryRun) {
  const s = store();
  s.runs.set(run.run_id, run);
  s.order.unshift(run.run_id);
  if (s.order.length > 50) s.order.length = 50;
}

export function listRunIds(): string[] {
  return store().order.slice();
}

export function getRun(id: string): DiscoveryRun | undefined {
  return store().runs.get(id);
}
