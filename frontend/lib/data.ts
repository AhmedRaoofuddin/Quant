// Data access layer. Prefers Supabase when configured (NEXT_PUBLIC_SUPABASE_URL), otherwise
// talks to the C++ REST backend. Both return the same DiscoveryRun shape, so components never
// know which source is live.

import type { DiscoveryRun, LibraryAlpha } from "./types";

// Empty default = same-origin Next.js API routes (the built-in TypeScript engine). Set
// NEXT_PUBLIC_API_URL to the C++ REST service to use that instead.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON);

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

// ---- Supabase (lazy import so the dep is optional at runtime) ----
async function supabase() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(SUPABASE_URL as string, SUPABASE_ANON as string);
}

export async function listRunIds(): Promise<string[]> {
  if (usingSupabase) {
    const sb = await supabase();
    const { data, error } = await sb
      .schema("alphaforge")
      .from("runs")
      .select("run_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map((r: { run_id: string }) => r.run_id);
  }
  return apiJson<string[]>("/api/runs");
}

export async function getRun(runId: string): Promise<DiscoveryRun> {
  if (usingSupabase) {
    const sb = await supabase();
    const { data, error } = await sb
      .schema("alphaforge")
      .from("runs")
      .select("payload")
      .eq("run_id", runId)
      .single();
    if (error) throw error;
    return data.payload as DiscoveryRun;
  }
  return apiJson<DiscoveryRun>(`/api/runs/${runId}`);
}

export async function getLatestRun(): Promise<DiscoveryRun | null> {
  const ids = await listRunIds();
  if (ids.length === 0) return null;
  return getRun(ids[0]);
}

export async function getLibrary(): Promise<LibraryAlpha[]> {
  return apiJson<LibraryAlpha[]>("/api/alphas/library");
}

export async function triggerDiscovery(n: number, allocator: string): Promise<DiscoveryRun> {
  // Discovery is a backend compute action, always routed to the C++ API.
  return apiJson<DiscoveryRun>("/api/discover", {
    method: "POST",
    body: JSON.stringify({ n, allocator }),
  });
}
