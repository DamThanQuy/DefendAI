import { NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders, readUpstream, upstreamFailure } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const url = `${backendUrl()}/api/documents/upload`;
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const authHeader = request.headers.get('authorization') || '';

    const backendFormData = new FormData();
    backendFormData.append('file', file);
    const purpose = formData.get('purpose');
    if (purpose) {
      backendFormData.append('purpose', purpose);
    }

    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const backendResponse = await fetch(url, {
      method: 'POST',
      headers,
      body: backendFormData,
    });

    const upstream = await readUpstream(backendResponse);
    if (upstream.nonJson) {
      return upstreamFailure('Document upload', { url, status: backendResponse.status, upstream });
    }

    if (!upstream.ok) {
      return NextResponse.json(upstream.data, { status: backendResponse.status });
    }

    const data = (upstream.data ?? {}) as Record<string, any>;
    return NextResponse.json({
      success: true,
      documentId: data.id,
      id: data.id,
      message: 'File uploaded successfully via FastAPI',
      backendData: data,
    });
  } catch (error: any) {
    return upstreamFailure('Document upload', { url, cause: error });
  }
}
