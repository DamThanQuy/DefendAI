/** @type {import('next').NextConfig} */
// Rewrite chạy SERVER-SIDE (trong container web) → phải dùng BACKEND_URL
// (http://api:8000 — docker network). NEXT_PUBLIC_API_URL (localhost:8000) chỉ
// dành cho browser; dùng nó trong rewrite gây ECONNREFUSED trong container.
// Fallback cho local dev (npm run dev ngoài docker) và Vercel (public API URL).
const PROXY_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const nextConfig = {
  // output: "standalone" chỉ dùng cho Docker/Node server.
  // Vercel tự build & serve nên không cần (tránh conflict với vercel.json).
  // Nếu deploy bằng Docker, bỏ comment dòng dưới:
  // output: "standalone",

  // Proxy /api/* → backend (giúp frontend gọi /api/auth/login từ cùng origin,
  // tránh CORS + cookie issues). Backend thật vẫn chạy ở localhost:8000 (docker).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${PROXY_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
