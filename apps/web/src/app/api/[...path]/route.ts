import { NextRequest, NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

// Generic catch-all proxy: forwards /api/{path...} → BACKEND/api/{path...}.
// Lets the browser-only axios client (lib/api.ts, baseURL="") reach the backend
// without resolving the docker-internal host `api`. Specific routes
// (auth/*, workspaces/[...], questions/*, documents/*, ...) take precedence.
async function proxy(request: NextRequest, { params }: { params: any }) {
  const sub = (params.path || []).join('/');
  const url = `${backendUrl()}/api/${sub}`;
  const authHeader = request.headers.get('authorization') || '';
  const headers: Record<string, string> = { ...ngrokHeaders() };
  if (authHeader) headers['Authorization'] = authHeader;

  const init: RequestInit = { method: request.method, headers };
  if (request.method === 'POST' || request.method === 'PATCH' || request.method === 'PUT') {
    const body = await request.text();
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = body;
    }
  }

  try {
    const res = await fetch(url, init);
    if (res.status === 204) return new Response(null, { status: 204 });

    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      // Upstream trả về không phải JSON (HTML 502/504, body lỗi...) → lộ nguyên nhân.
      console.error('catch-all non-JSON upstream:', url, upstream);
      return upstreamFailure('API proxy', { url, status: upstream.status, upstream });
    }
    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (error: any) {
    console.error('catch-all proxy error:', url, error);
    return upstreamFailure('API proxy', { url, status: 502, cause: error });
  }
}

export async function GET(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function POST(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function PATCH(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function PUT(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function DELETE(request: NextRequest, ctx: any) { return proxy(request, ctx); }