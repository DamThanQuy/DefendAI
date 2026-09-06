import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;

    const url = new URL(request.url);
    const qs = url.search || '';

    const res = await fetch(`${API_URL}/api/documents/${qs}`, {
      headers,
      redirect: 'follow',
      cache: 'no-store',
    });
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Documents list proxy failed', message: error.message },
      { status: 500 },
    );
  }
}
