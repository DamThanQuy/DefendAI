import { NextResponse } from 'next/server';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const res = await fetch(`${backendUrl}/api/code/analyses`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to load analyses' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Analyses proxy error:', error);
    return NextResponse.json({ error: 'Analyses proxy failed', message: error.message }, { status: 500 });
  }
}