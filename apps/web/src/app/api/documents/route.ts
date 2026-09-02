import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${backendUrl}/api/documents/`, { headers });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'Documents list proxy failed', message: error.message }, { status: 500 });
  }
}