import { NextResponse } from 'next/server';
import { backendUrl, ngrokHeaders } from '@/lib/upstream';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const baseUrl = backendUrl();

    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ngrokHeaders() },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: 'Login failed', message: error.message }, { status: 500 });
  }
}
