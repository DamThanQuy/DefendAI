import { NextResponse } from 'next/server';
import { backendUrl, fetchUpstream, ngrokHeaders } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetchUpstream(`${backendUrl()}/api/documents/${params.id}/restore`, {
      method: 'POST',
      headers,
    });

    const data = await res.text();

    // Nếu backend trả về 400 "chưa bị xoá", có thể do retry sau khi đã khôi phục thành công
    if (res.status === 400 && data.includes('chưa bị xoá')) {
      return new Response(JSON.stringify({ success: true, message: 'Đã khôi phục' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(data, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Document restore proxy failed', message: error.message },
      { status: 502 },
    );
  }
}
