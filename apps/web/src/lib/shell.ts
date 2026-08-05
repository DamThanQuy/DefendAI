/**
 * Quyết định trang nào dùng shell "app" (sidebar trái) và trang nào dùng
 * navbar marketing (top nav) + footer. Dùng chung bởi Navbar, Footer, AppShell
 * để tránh lệch nhau.
 */
const PUBLIC_PATHS = ["/", "/demo", "/login", "/register"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}
