import { NextResponse } from "next/server";
import { getUniverse } from "@/lib/marketdata";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const data = await getUniverse(force);
    // `daily` carries every close for 78 names and exists only so server-side statistics are not
    // computed on a chart-thinned series. Sending it would multiply this payload several times
    // over for data the browser never plots.
    const assets = data.assets.map(({ daily, ...rest }) => {
      void daily;
      return rest;
    });
    return NextResponse.json({ ...data, assets });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 502 });
  }
}
