import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { documentId, persona } = await request.json();

    if (!documentId || !persona) {
      return NextResponse.json({ error: 'Missing documentId or persona' }, { status: 400 });
    }

    // Giả lập AI generate delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const questions = Array.from({ length: 10 }).map((_, i) => ({
      id: i + 1,
      question: `Dưới góc độ ${persona === 'hard' ? 'Hội đồng phản biện khó tính' : persona === 'tech' ? 'Chuyên gia kỹ thuật sâu' : 'Giảng viên hướng dẫn'}, bạn hãy giải thích chi tiết về phần cốt lõi số ${i + 1} trong hệ thống?`,
      difficulty: i < 3 ? 'Dễ' : i < 7 ? 'Trung bình' : 'Khó',
      suggestion: 'Tập trung vào ưu điểm, nhược điểm của công nghệ sử dụng và so sánh với các giải pháp khác. Có thể trình bày thêm quy trình xử lý dữ liệu thực tế.'
    }));

    return NextResponse.json({
      success: true,
      questions
    });
  } catch (error) {
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
