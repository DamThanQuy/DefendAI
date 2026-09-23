import { NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${backendUrl()}/api/documents/${params.id}`, {
      method: 'DELETE',
      headers,
      cache: 'no-store',
    });

    if (res.status === 204) {
      return new Response(null, {
        status: 204,
        headers: { 'cache-control': 'no-store, must-revalidate' },
      });
    }

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
      { error: 'Document delete proxy failed', message: error.message },
      { status: 500 },
    );
  }
}
