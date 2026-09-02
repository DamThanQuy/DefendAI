import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

// Generic catch-all proxy: forwards /api/{path...} → BACKEND/api/{path...}.
// Lets the browser-only axios client (lib/api.ts, baseURL="") reach the backend
// without resolving the docker-internal host `api`. Specific routes
// (auth/*, workspaces/[...], questions/*, documents/*, ...) take precedence.
async function proxy(request: NextRequest, { params }: { params: any }) {
  const sub = (params.path || []).join('/');
  const url = `${BACKEND}/api/${sub}`;
  const authHeader = request.headers.get('authorization') || '';
  const headers: Record<string, string> = {};
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
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: 'API proxy failed', message: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function POST(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function PATCH(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function PUT(request: NextRequest, ctx: any) { return proxy(request, ctx); }
export async function DELETE(request: NextRequest, ctx: any) { return proxy(request, ctx); }