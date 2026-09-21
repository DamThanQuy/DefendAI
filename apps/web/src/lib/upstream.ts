/**
 * Shared upstream helpers cho các BFF route proxy sang FastAPI.
 *
 * Vấn đề cũ: route gọi `backendRes.json()` ngay, nên khi upstream chết giữa
 * chừng (proxy hạ tầng trả HTML 502/504, hoặc backend trả body rỗng) thì
 * Next.js bắt exception và nuốt thành `{ error: "... proxy failed",
 * message: "Unexpected token '<', \"<!DOCTYPE \"..." }` — người dùng không
 * biết lỗi thật ở đâu.
 *
 * Cách mới: luôn đọc `text()` trước, chỉ parse JSON khi `content-type` là
 * JSON. Nếu không phải JSON → trả về status THẬT của upstream kèm snippet body
 * (`upstream_snippet`) để UI/log cho biết ngay backend nào đang gãy.
 */
import { NextResponse } from "next/server";

export const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const SNIPPET_LIMIT = 300;

export function backendUrl(): string {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_BACKEND_URL
  );
}

/**
 * Extra headers needed when BACKEND_URL is an ngrok tunnel (free tier
 * shows a browser-warning page unless this header is present).
 */
export function ngrokHeaders(): Record<string, string> {
  const url = backendUrl();
  const nextPublicUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";
  if (url.includes("ngrok") || nextPublicUrl.includes("ngrok")) {
    return { "ngrok-skip-browser-warning": "true" };
  }
  return {};
}

export function authOnlyHeaders(
  request: Request,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...ngrokHeaders(), ...extra };
  const authHeader = request.headers.get("authorization");
  if (authHeader) headers["Authorization"] = authHeader;
  return headers;
}

export interface UpstreamResult {
  ok: boolean;
  status: number;
  /** JSON đã parse, hoặc null khi body rỗng / không phải JSON. */
  data: unknown;
  /** true khi upstream trả về nội dung KHÔNG phải JSON (HTML 502/504, text lỗi...). */
  nonJson: boolean;
  /** Body thô khi `nonJson`. */
  snippet?: string;
  contentType?: string | null;
}

function looksLikeJson(contentType: string | null, text: string): boolean {
  if (contentType?.includes("json")) return true;
  const head = text.trimStart().slice(0, 1);
  return head === "{" || head === "[";
}

function toSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LIMIT);
}

/**
 * Đọc response từ FastAPI một cách an toàn: không bao giờ throw vì body lạ.
 * Network-level error (backend unreachable) vẫn throw — caller lo phần đó.
 */
export async function readUpstream(res: Response): Promise<UpstreamResult> {
  const contentType = res.headers.get("content-type");
  const text = await res.text();

  const isJson = looksLikeJson(contentType ?? null, text);
  if (isJson) {
    try {
      return {
        ok: res.ok,
        status: res.status,
        data: text ? JSON.parse(text) : null,
        nonJson: false,
        contentType,
      };
    } catch {
      // Looks like JSON (content-type/opening brace) but failed to parse
      // → treat as non-JSON so the caller surfaces the raw snippet.
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data: null,
    nonJson: true,
    snippet: toSnippet(text),
    contentType,
  };
}

/**
 * Body lỗi nhất quán cho mọi failure path của multipart BFF.
 * `upstream` = kết quả readUpstream khi backend trả về không phải JSON.
 */
export function upstreamFailure(
  label: string,
  opts: {
    url: string;
    status?: number;
    upstream?: UpstreamResult;
    cause?: unknown;
  },
): NextResponse {
  const payload = {
    error: `${label} failed`,
    upstream_url: opts.url,
    ...(opts.status !== undefined ? { upstream_status: opts.status } : {}),
    ...(opts.upstream?.contentType !== undefined
      ? { upstream_content_type: opts.upstream.contentType }
      : {}),
    ...(opts.upstream?.snippet ? { upstream_snippet: opts.upstream.snippet } : {}),
    ...(opts.cause instanceof Error ? { message: opts.cause.message } : {}),
  };

  // Giữ nguyên status THẬT của upstream (502/504/413...) khi có response;
  // 502Bad Gateway chỉ dùng cho network-level failure (không có upstream status).
  const status = opts.status ?? 502;
  return NextResponse.json(payload, { status });
}
