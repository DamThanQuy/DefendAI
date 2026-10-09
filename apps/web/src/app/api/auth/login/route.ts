import { NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from '@/lib/upstream';

export async function POST(request: Request) {
  const url = `${backendUrl()}/api/auth/login`;
  try {
    const body = await request.json();

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ngrokHeaders() },
      body: JSON.stringify(body),
    });

    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      return upstreamFailure('Login', { url, status: res.status, upstream });
    }

    if (!upstream.ok) {
      return NextResponse.json(upstream.data, { status: res.status });
    }

    return NextResponse.json(upstream.data);
  } catch (error: any) {
    return upstreamFailure('Login', { url, cause: error });
  }
}
