import { NextResponse } from 'next/server';
import { backendUrl, fetchUpstream, ngrokHeaders } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetchUpstream(`${backendUrl()}/api/documents/${params.id}`, {
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

    // Nếu backend trả về 400 "đã nằm trong thùng rác" do retry sau khi đã commit,
    // coi như xoá thành công để người dùng không gặp thông báo lỗi giả.
    if (res.status === 400 && data.includes('thùng rác')) {
      return new Response(null, {
        status: 204,
        headers: { 'cache-control': 'no-store, must-revalidate' },
      });
    }

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
      { status: 502 },
    );
  }
}
