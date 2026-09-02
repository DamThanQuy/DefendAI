/** @type {import('next').NextConfig} */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
