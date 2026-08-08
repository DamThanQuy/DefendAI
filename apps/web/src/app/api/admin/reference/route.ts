import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const title = searchParams.get("title");
    // Có category+title → preview chunks của 1 tài liệu chuẩn
    const path =
      category && title
        ? `/api/admin/reference/chunks?category=${encodeURIComponent(category)}&title=${encodeURIComponent(title)}`
        : "/api/admin/reference/";
    const res = await fetch(`${BACKEND_URL}${path}`, {
      headers: auth ? { Authorization: auth } : {},
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Admin reference proxy failed", message: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const title = searchParams.get("title");
    if (!category || !title) {
      return NextResponse.json({ error: "category and title are required" }, { status: 400 });
    }
    const res = await fetch(
      `${BACKEND_URL}/api/admin/reference/?category=${encodeURIComponent(category)}&title=${encodeURIComponent(title)}`,
      { method: "DELETE", headers: auth ? { Authorization: auth } : {} },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Admin reference proxy failed", message: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const category = formData.get("category");
    const title = formData.get("title");
    const source = formData.get("source") || "";

    if (!file || !category || !title) {
      return NextResponse.json({ error: "file, category, title are required" }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization") || "";
    const backendFormData = new FormData();
    backendFormData.append("file", file);
    backendFormData.append("category", category as string);
    backendFormData.append("title", title as string);
    backendFormData.append("source", source as string);

    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;

    const backendResponse = await fetch(`${BACKEND_URL}/api/admin/reference/`, {
      method: "POST",
      headers,
      body: backendFormData,
    });
    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Admin reference proxy failed", message: e.message }, { status: 500 });
  }
}
