import { NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${backendUrl()}/api/documents/${params.id}/restore`, {
      method: 'POST',
      headers,
    });

    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Document restore proxy failed', message: error.message },
      { status: 500 },
    );
  }
}
