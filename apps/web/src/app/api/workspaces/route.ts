import { NextRequest, NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest) {
  const url = `${backendUrl()}/api/workspaces/`;
  try {
    // NOTE: thêm slash cuối — FastAPI khai báo route "/api/workspaces/" (redirect_slashes).
    // Gọi không slash → 307 redirect → fetch rớt Authorization khi follow → 401.
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    const init: RequestInit = { method: request.method, headers };
    if (request.method === 'POST' || request.method === 'PATCH') {
      const body = await request.text();
      if (body) {
        headers['Content-Type'] = 'application/json';
        init.body = body;
      }
    }

    const res = await fetch(url, init);
    if (res.status === 204) {
      return new Response(null, { status: 204 });
    }

    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      return upstreamFailure('Workspace proxy', { url, status: upstream.status, upstream });
    }

    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (error: any) {
    return upstreamFailure('Workspace proxy', { url, status: 500, cause: error });
  }
}

export async function GET(request: NextRequest) {
  return proxy(request);
}
export async function POST(request: NextRequest) {
  return proxy(request);
}