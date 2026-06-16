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
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    
    const uploadRes = await fetch(`${backendUrl}/api/documents/upload`, {
      method: 'POST',
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

    // Tính toán lại stats để hiển thị UI
    let critical = 0;
    let warnings = 0;
    let optimizations = 0;

    (scanData.issues || []).forEach((issue: any) => {
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
      backendData: scanData,
      details: scanData.issues
    });
  } catch (error: any) {
    console.error('Scan proxy error:', error);
    return NextResponse.json({ error: 'Scan proxy failed', message: error.message }, { status: 500 });
  }
}
