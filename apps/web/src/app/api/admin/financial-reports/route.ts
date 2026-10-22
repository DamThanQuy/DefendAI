import { NextResponse } from "next/server";
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from "@/lib/upstream";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryString = searchParams.toString();
  const url = `${backendUrl()}/api/admin/financial-reports${queryString ? `?${queryString}` : ""}`;

  try {
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(url, {
      headers: { ...ngrokHeaders(), ...(auth ? { Authorization: auth } : {}) },
      cache: "no-store",
    });
    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      return upstreamFailure("Admin financial reports proxy", { url, status: upstream.status, upstream });
    }
    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (e: any) {
    return upstreamFailure("Admin financial reports proxy", { url, status: 500, cause: e });
  }
}
