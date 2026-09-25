import { NextResponse } from "next/server";
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from "@/lib/upstream";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = `${backendUrl()}/api/subscriptions/plans`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { ...ngrokHeaders() },
    });
    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      return upstreamFailure("Subscription proxy", { url, status: upstream.status, upstream });
    }
    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (error) {
    return upstreamFailure("Subscription proxy", { url, status: 500, cause: error });
  }
}
