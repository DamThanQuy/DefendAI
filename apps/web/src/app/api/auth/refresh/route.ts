import { NextResponse } from 'next/server';
import { backendUrl, fetchUpstream, ngrokHeaders, readUpstream, upstreamFailure } from '@/lib/upstream';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = `${backendUrl()}/api/auth/refresh`;

    // fetchUpstream tự retry 2 lần với lỗi mạng thoáng qua / 502-503-504 từ tunnel
    // (trước đây fetch 1 phát fail là nuốt thành 500 → FE đá user ra login giữa phiên).
    const backendRes = await fetchUpstream(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ngrokHeaders() },
      body: JSON.stringify(body),
    });

    const upstream = await readUpstream(backendRes);

    // Upstream trả body không phải JSON (HTML 502/504 của tunnel, text lỗi...)
    // → giữ nguyên status thật kèm snippet để debug, không tự chế 500.
    if (upstream.nonJson) {
      return upstreamFailure('Refresh', { url, status: upstream.status, upstream });
    }

    if (!upstream.ok) {
      // Passthrough: 401 của backend (refresh token hết hạn/revoked) phải giữ
      // nguyên 401 + {detail} để FE phân biệt với lỗi hạ tầng.
      return NextResponse.json(upstream.data, { status: upstream.status });
    }

    return NextResponse.json(upstream.data);
  } catch (error: any) {
    // Chỉ tới đây khi fetch fail sau khi đã retry (backend unreachable).
    // Trả 503 để FE biết đây là lỗi TẠM THỜI, không phải hết phiên.
    return NextResponse.json(
      { error: 'Refresh failed', message: error?.message ?? 'backend unreachable' },
      { status: 503 },
    );
  }
}
