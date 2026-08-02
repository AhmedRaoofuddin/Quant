import { NextResponse } from "next/server";
import { getSources } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    return NextResponse.json(await getSources(force));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
