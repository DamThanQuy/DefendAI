import { NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = `${backendUrl()}/api/documents/quota`;
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const backendResponse = await fetch(url, { headers });
    const upstream = await readUpstream(backendResponse);
    if (upstream.nonJson) {
      return upstreamFailure('Upload quota', { url, status: backendResponse.status, upstream });
    }
    return NextResponse.json(upstream.data, { status: backendResponse.status });
  } catch (error: any) {
    return upstreamFailure('Upload quota', { url, cause: error });
  }
}
