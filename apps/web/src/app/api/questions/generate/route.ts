import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { documentId, persona } = await request.json();

    if (!documentId || !persona) {
      return NextResponse.json({ error: 'Missing documentId or persona' }, { status: 400 });
    }

    // Proxy request sang Python Backend FastAPI
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${backendUrl}/api/questions/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ document_id: documentId, persona }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: 'Generate proxy failed', message: error.message }, { status: 500 });
  }
}
