import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/subscriptions/plans`, { cache: "no-store" });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: "Subscription proxy failed", message: String(error) }, { status: 500 });
  }
}
