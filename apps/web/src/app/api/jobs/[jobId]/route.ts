import { NextResponse } from 'next/server';
import { ngrokHeaders } from '@/lib/upstream';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { jobId: string } }) {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const authHeader = request.headers.get('authorization') || '';

    const headers: Record<string, string> = { ...ngrokHeaders() };
    if (authHeader) headers['Authorization'] = authHeader;

    const res = await fetch(`${backendUrl}/api/jobs/${params.jobId}`, { headers });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'Job poll proxy failed', message: error.message }, { status: 500 });
  }
}
