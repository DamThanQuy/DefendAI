import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

async function proxy(request: NextRequest) {
  try {
    const url = `${BACKEND}/api/workspaces`;
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = {};
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
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: 'Workspace proxy failed', message: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return proxy(request);
}
export async function POST(request: NextRequest) {
  return proxy(request);
}