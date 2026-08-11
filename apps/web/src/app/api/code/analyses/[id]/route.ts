import { NextResponse } from 'next/server';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const res = await fetch(`${backendUrl}/api/code/analyses/${params.id}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: 'Analysis load failed', details: err }, { status: res.status });
    }
    const analysis = await res.json();
    if (analysis.status !== 'completed') {
      return NextResponse.json({ success: false, error: analysis.error || 'Code review chưa hoàn thành', analysis }, { status: 422 });
    }

    const issues = analysis.issues || [];
    const stats = analysis.stats || {};
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
      documentId: analysis.document_id,
      stats: { critical, warnings, optimizations },
      backendData: {
        pass_rate: analysis.pass_rate ?? 0,
        summary: analysis.summary || '',
        provider: analysis.provider,
        model: analysis.model,
        total_modules: analysis.total_modules,
        done_modules: analysis.done_modules,
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
  } catch (error: any) {
    console.error('Analysis proxy error:', error);
    return NextResponse.json({ error: 'Analysis proxy failed', message: error.message }, { status: 500 });
  }
}