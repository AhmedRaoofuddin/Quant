import { NextResponse } from "next/server";
import { runDiscovery } from "@/lib/engine";
import { addRun } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let n = 12;
  try {
    const body = await req.json();
    if (typeof body?.n === "number") n = Math.max(4, Math.min(12, body.n));
  } catch {
    /* empty body is fine */
  }
  // A fresh seed each call so repeated runs differ, as a real discovery would.
  const seed = 40 + Math.floor(Math.random() * 9999);
  const run = runDiscovery(seed, n);
  addRun(run);
  return NextResponse.json(run, { status: 201 });
}
