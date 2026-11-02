/**
 * Auth helpers dùng chung — single source of truth cho token refresh.
 *
 * Cả `api.ts` (axios interceptor) và `AuthGate` phải gọi refresh qua module này,
 * nếu không sẽ có 2 queue refresh độc lập → race rotate token (bug đã gặp).
 */

// Single-flight: mọi caller chờ cùng 1 promise, chỉ 1 request refresh được gửi.
let refreshPromise: Promise<RefreshResult> | null = null;

/**
 * Kết quả refresh: `token === null` khi refresh không thành công, và
 * `transient === true` khi lỗi là TẠM THỜI (backend unreachable, 5xx từ
 * tunnel/proxy) — caller KHÔNG được đăng xuất trong trường hợp này, chỉ cần
 * thử lại ở chu kỳ sau. `transient === false` mới là "hết phiên thật"
 * (401/422 từ backend: refresh token hết hạn hoặc revoked).
 */
export interface RefreshResult {
  token: string | null;
  transient: boolean;
}

// Gọi qua Next.js proxy (relative URL) thay vì API_BASE_URL trực tiếp:
// trong docker API_BASE_URL = http://api:8000 mà browser không resolve được host `api`.
export async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return { token: null, transient: false };

  if (!refreshPromise) {
    refreshPromise = (async (): Promise<RefreshResult> => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (res.status >= 500) {
          // Lỗi hạ tầng (backend unreachable / tunnel hiccup) — tạm thời,
          // không được clearSession (bug đã gặp: 1 hiccup = mất phiên).
          return { token: null, transient: true };
        }
        if (!res.ok) return { token: null, transient: false };
        const data = await res.json();
        localStorage.setItem("access_token", data.token);
        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }
        return { token: data.token as string, transient: false };
      } catch {
        // fetch fail (mạng, proxy chết) — tạm thời như 5xx.
        return { token: null, transient: true };
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}

export function handleSessionExpired() {
  clearSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

// JWT payload `exp` là epoch seconds (BE dùng python-jose). Giải mã không cần lib.
export function getTokenExpiry(): number | null {
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
