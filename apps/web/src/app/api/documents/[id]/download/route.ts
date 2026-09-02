import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;

    // Forward the response directly (binary file)
    const res = await fetch(`${backendUrl}/api/documents/${params.id}/download`, { headers });

    if (!res.ok) {
      const errorData = await res.json();
      return NextResponse.json(errorData, { status: res.status });
    }

    // Get the file bytes and content-type from backend
    const blob = await res.blob();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const disposition = res.headers.get('content-disposition') || `attachment; filename="document-${params.id}"`;

    return new NextResponse(blob, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Download proxy failed', message: error.message }, { status: 500 });
  }
}