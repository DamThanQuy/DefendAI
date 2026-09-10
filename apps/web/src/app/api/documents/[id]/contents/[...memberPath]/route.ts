import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string; memberPath: string[] } }) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;

    const memberPath = params.memberPath.join('/');
    const res = await fetch(`${backendUrl}/api/documents/${params.id}/contents/${memberPath}`, { headers });

    if (!res.ok) {
      const errorData = await res.json();
      return NextResponse.json(errorData, { status: res.status });
    }

    const blob = await res.blob();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(blob, {
      status: 200,
      headers: { 'Content-Type': contentType },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Member content proxy failed', message: error.message }, { status: 500 });
  }
}