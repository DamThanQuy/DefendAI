import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'Source code zip is required' }, { status: 400 });
    }

    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

    // 1. Upload file to backend
    const authHeader = request.headers.get('authorization') || '';
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    const uploadHeaders: Record<string, string> = {};
    if (authHeader) {
      uploadHeaders['Authorization'] = authHeader;
    }

    const uploadRes = await fetch(`${backendUrl}/api/documents/upload`, {
      method: 'POST',
      headers: uploadHeaders,
      body: uploadFormData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      return NextResponse.json({ error: 'Upload zip failed', details: err }, { status: uploadRes.status });
    }

    const docData = await uploadRes.json();
    const documentId = docData.id;

    // 2. Request Code Scan
    const scanRes = await fetch(`${backendUrl}/api/code/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_id: documentId }),
    });

    if (!scanRes.ok) {
      const err = await scanRes.json();
      return NextResponse.json({ error: 'Code scan failed', details: err }, { status: scanRes.status });
    }

    const scanData = await scanRes.json();
    const jobId = scanData.job_id;

    // 3. Poll job cho đến khi hoàn tất (timeout 90s — AI scan có thể lâu)
    const pollInterval = 1500;
    const maxAttempts = 60;
    let job: any = null;

    for (let i = 0; i < maxAttempts; i++) {
      const pollRes = await fetch(`${backendUrl}/api/jobs/${jobId}`);
      if (!pollRes.ok) {
        const err = await pollRes.json();
        return NextResponse.json({ error: 'Job polling failed', details: err }, { status: pollRes.status });
      }
      job = await pollRes.json();

      if (job.status === 'completed') break;
      if (job.status === 'failed') {
        return NextResponse.json({
          success: false,
          error: job.error || 'Code scan thất bại',
          documentId,
        }, { status: 422 });
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }

    if (!job || job.status !== 'completed') {
      return NextResponse.json({ error: 'Code scan timeout' }, { status: 504 });
    }

    const issues = job.result?.issues || [];
    const summary = job.result?.summary || '';
    const passRate = job.result?.pass_rate ?? 0;

    // Tính toán lại stats để hiển thị UI
    let critical = 0;
    let warnings = 0;
    let optimizations = 0;

    issues.forEach((issue: any) => {
      const sev = issue.severity?.toLowerCase();
      if (sev === 'critical' || sev === 'high') critical++;
      else if (sev === 'medium') warnings++;
      else optimizations++;
    });

    return NextResponse.json({
      success: true,
      stats: {
        critical,
        warnings,
        optimizations
      },
      backendData: { ...job.result, pass_rate: passRate, summary },
      details: issues
    });
  } catch (error: any) {
    console.error('Scan proxy error:', error);
    return NextResponse.json({ error: 'Scan proxy failed', message: error.message }, { status: 500 });
  }
}
