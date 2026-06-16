import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'Source code zip is required' }, { status: 400 });
    }

    // Giả lập processing delay
    await new Promise((resolve) => setTimeout(resolve, 2500));

    return NextResponse.json({
      success: true,
      stats: {
        critical: 3,
        warnings: 12,
        optimizations: 24
      },
      details: [
        {
          id: 1,
          file: 'src/services/api.js',
          type: 'Critical',
          title: 'SQL Injection Vulnerability',
          description: 'Lỗi nối chuỗi trực tiếp trong câu query SQL. Hãy sử dụng parameterized queries hoặc ORM để bảo mật dữ liệu.',
          oldCode: '- const query = "SELECT * FROM users WHERE id = " + userId;',
          newCode: '+ const query = "SELECT * FROM users WHERE id = ?";'
        },
        {
          id: 2,
          file: 'src/components/List.jsx',
          type: 'Warning',
          title: 'Missing Key Prop',
          description: 'Render list trong React thiếu thuộc tính key, ảnh hưởng đến performance render và state management.',
          oldCode: '- {items.map(item => <div>{item.name}</div>)}',
          newCode: '+ {items.map(item => <div key={item.id}>{item.name}</div>)}'
        },
        {
          id: 3,
          file: 'src/utils/auth.js',
          type: 'Critical',
          title: 'Hardcoded JWT Secret',
          description: 'Secret key được hardcode trực tiếp trong source code. Hãy chuyển sang sử dụng biến môi trường (Environment Variables).',
          oldCode: '- const jwtSecret = "my-super-secret-key-123";',
          newCode: '+ const jwtSecret = process.env.JWT_SECRET;'
        }
      ]
    });
  } catch (error) {
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
