import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

/**
 * Lightweight status endpoint for FE to poll during long-running code scan.
 * Returns immediately with current state + module progress.
 *
 * URL: /api/code/analysis-status/{id}
 * Method: GET
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const analysisId = Number(params.id);
  if (!Number.isFinite(analysisId) || analysisId <= 0) {
    return NextResponse.json({ error: 'Invalid analysis id' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization') || '';

  try {
    const res = await fetch(`${backendUrl}/api/code/analyses/${analysisId}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: 'Analysis lookup failed', details: err },
        { status: res.status },
      );
    }
    const analysis = await res.json();

    return NextResponse.json({
      analysis_id: analysisId,
      status: analysis.status, // queued | processing | completed | failed
      total_files: analysis.total_files ?? 0,
      total_modules: analysis.total_modules ?? 0,
      done_modules: analysis.done_modules ?? 0,
      error: analysis.error ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Status proxy failed', message: e?.message },
      { status: 500 },
    );
  }
}
