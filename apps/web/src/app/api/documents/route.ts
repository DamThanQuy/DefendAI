import { NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    const url = new URL(request.url);
    const qs = url.search || '';

    const res = await fetch(`${backendUrl()}/api/documents/${qs}`, {
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
