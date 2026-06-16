import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Proxy request sang Python Backend FastAPI
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000';
    
    // Tạo FormData mới để gửi qua Backend
    const backendFormData = new FormData();
    backendFormData.append('file', file);

    const backendResponse = await fetch(`${backendUrl}/api/documents/upload`, {
      method: 'POST',
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      return NextResponse.json(
        { error: 'Backend upload failed', details: errorData }, 
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();

    // Mapping dữ liệu trả về từ Backend để Frontend UploadZone vẫn hiểu được
    return NextResponse.json({
      success: true,
      documentId: data.id,
      message: 'File uploaded successfully via FastAPI',
      backendData: data
    });
  } catch (error: any) {
    console.error('Upload proxy error:', error);
    return NextResponse.json({ error: 'Upload proxy failed', message: error.message }, { status: 500 });
  }
}
