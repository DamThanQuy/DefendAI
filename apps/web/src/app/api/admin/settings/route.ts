import { NextResponse } from "next/server";
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from "@/lib/upstream";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = `${backendUrl()}/api/admin/settings`;
  try {
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(url, {
      headers: { ...ngrokHeaders(), ...(auth ? { Authorization: auth } : {}) },
    });
    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      return upstreamFailure("Admin settings proxy", { url, status: upstream.status, upstream });
    }
    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (e: any) {
    return upstreamFailure("Admin settings proxy", { url, status: 500, cause: e });
  }
}

export async function PUT(request: Request) {
  const url = `${backendUrl()}/api/admin/settings`;
  try {
    const auth = request.headers.get("authorization") || "";
    const body = await request.json();
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      return upstreamFailure("Admin settings proxy", { url, status: upstream.status, upstream });
    }
    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (e: any) {
    return upstreamFailure("Admin settings proxy", { url, status: 500, cause: e });
  }
}