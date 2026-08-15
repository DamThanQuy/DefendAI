import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

async function proxy(request: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    // Reconstruct backend path: /api/workspaces[/{path...}]
    const sub = (params.path || []).join('/');
    const url = `${BACKEND}/api/workspaces${sub ? `/${sub}` : ''}`;
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = {};
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

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: 'Workspace proxy failed', message: error.message }, { status: 500 });
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
