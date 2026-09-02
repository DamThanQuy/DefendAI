import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

// Scan theo document_id (đã upload) → backend tạo CodeAnalysis + job → poll analysis
async function scanDocument(documentId: number, authHeader: string) {
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
  const analysisId = scanData.analysis_id;
  if (!analysisId) {
    return NextResponse.json({ error: 'Backend did not return analysis_id' }, { status: 502 });
  }

  // Poll GET /api/code/analyses/{id} cho đến khi completed/failed (timeout 10 phút cho file lớn)
  const pollInterval = 2000;
  const maxAttempts = 300;
  let analysis: any = null;
  let moduleProgress = { done: 0, total: 0 };

  for (let i = 0; i < maxAttempts; i++) {
    const pollRes = await fetch(`${backendUrl}/api/code/analyses/${analysisId}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    if (!pollRes.ok) {
      const err = await pollRes.json();
      return NextResponse.json({ error: 'Analysis polling failed', details: err }, { status: pollRes.status });
    }
    analysis = await pollRes.json();

    // Track module progress during scanning
    if (analysis.total_modules && analysis.done_modules !== undefined) {
      moduleProgress = { done: analysis.done_modules, total: analysis.total_modules };
    }

    if (analysis.status === 'completed') break;
    if (analysis.status === 'failed') {
      return NextResponse.json({
        success: false,
        error: analysis.error || 'Code scan thất bại',
        documentId,
      }, { status: 422 });
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  if (!analysis || analysis.status !== 'completed') {
    return NextResponse.json({ error: 'Code scan timeout' }, { status: 504 });
  }

  const issues = analysis.issues || [];
  const stats = analysis.stats || {};

  // Tính toán lại stats để hiển thị UI (fallback nếu backend chưa tổng hợp)
  let critical = 0;
  let warnings = 0;
  let optimizations = 0;
  if (Object.keys(stats).length) {
    critical = (stats.critical || 0) + (stats.high || 0);
    warnings = stats.medium || 0;
    optimizations = (stats.low || 0) + (stats.info || 0);
  } else {
    issues.forEach((issue: any) => {
      const sev = issue.severity?.toLowerCase();
      if (sev === 'critical' || sev === 'high') critical++;
      else if (sev === 'medium') warnings++;
      else optimizations++;
    });
  }

  return NextResponse.json({
    success: true,
    documentId,
    stats: { critical, warnings, optimizations },
    backendData: {
      summary: analysis.summary || '',
      provider: analysis.provider,
      model: analysis.model,
      total_modules: analysis.total_modules,
      done_modules: analysis.done_modules,
      module_progress: moduleProgress,
    },
    details: issues.map((it: any, idx: number) => ({
      id: it.id ?? idx + 1,
      type: it.type || 'code_smell',
      file: it.file,
      line: it.line ?? 1,
      description: it.description || '',
      severity: it.severity,
      suggestion: it.suggestion || '',
    })),
  });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';

    // Mode 1: JSON { document_id } → scan lại tài liệu đã upload
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json();
      if (!body?.document_id) {
        return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
      }
      return scanDocument(body.document_id, authHeader);
    }

    // Mode 2: multipart file → upload mới rồi scan
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'Source code zip is required' }, { status: 400 });
    }

    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    const uploadHeaders: Record<string, string> = {};
    if (authHeader) uploadHeaders['Authorization'] = authHeader;

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
    return scanDocument(docData.id, authHeader);
  } catch (error: any) {
    console.error('Scan proxy error:', error);
    return NextResponse.json({ error: 'Scan proxy failed', message: error.message }, { status: 500 });
  }
}