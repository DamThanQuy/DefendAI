import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { documentId, persona } = await request.json();

    if (!documentId || !persona) {
      return NextResponse.json({ error: 'Missing documentId or persona' }, { status: 400 });
    }

    // Map persona FE → persona BE
    const personaMap: Record<string, string> = {
      normal: 'theory',
      hard: 'strict',
      tech: 'enterprise',
    };

    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    const res = await fetch(`${backendUrl}/api/questions/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id: Number(documentId),
        persona: personaMap[persona] || persona,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Backend error' }));
      return NextResponse.json({ error: 'Question generation failed', details: err }, { status: res.status });
    }

    const data = await res.json();

    // Map BE response → FE format
    const questions = (data.questions || []).map((q: any) => ({
      id: q.id,
      question: q.question,
      difficulty: q.difficulty === 'easy' ? 'Dễ' : q.difficulty === 'medium' ? 'Trung bình' : 'Khó',
      suggestion: q.hint,
      persona: q.persona,
    }));

    return NextResponse.json({
      success: true,
      questions,
      provider: data.provider,
      model: data.model,
    });
  } catch (error: any) {
    console.error('Question generation proxy error:', error);
    return NextResponse.json({ error: 'Generation failed', message: error.message }, { status: 500 });
  }
}
