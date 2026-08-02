import { NextResponse } from "next/server";
import { getNews } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    return NextResponse.json(await getNews(force));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
