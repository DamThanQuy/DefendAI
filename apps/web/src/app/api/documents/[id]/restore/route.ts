import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${API_URL}/api/documents/${params.id}/restore`, {
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
