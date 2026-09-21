import { NextRequest, NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const sub = (params.path || []).join('/');
  const url = `${backendUrl()}/api/workspaces${sub ? `/${sub}` : '/'}`;
  try {
    // Reconstruct backend path: /api/workspaces[/{path...}]
    // NOTE: FastAPI redirect_slashes — nếu path rỗng, gọi "/api/workspaces/" (slash cuối)
    // để tránh 307 redirect làm rớt Authorization header.
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    // Forward body for POST/PATCH (JSON)
    const init: RequestInit = { method: request.method, headers };
    if (request.method === 'POST' || request.method === 'PATCH') {
      const body = await request.text();
      if (body) {
        headers['Content-Type'] = 'application/json';
        init.body = body;
      }
    }

    const res = await fetch(url, init);

    // Endpoint stream (chat/stream): pass-through body, không buffer/JSON-parse
    if (params.path && params.path[params.path.length - 1] === 'stream') {
      return new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('content-type') || 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // 204 No Content (vd: DELETE) — không có body, trả nguyên status để tránh
    // NextResponse.json báo lỗi khi gán body cho response 204.
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

export async function GET(request: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxy(request, ctx);
}
export async function POST(request: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxy(request, ctx);
}
export async function PATCH(request: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxy(request, ctx);
}
export async function DELETE(request: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxy(request, ctx);
}
