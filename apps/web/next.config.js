/** @type {import('next').NextConfig} */
// Ưu tiên BACKEND_URL (server-side, runtime env trong docker-compose cho web
// service đặt thành "http://api:8000" qua mạng nội bộ Docker). Fallback về
// NEXT_PUBLIC_API_URL (đã bake vào client bundle lúc build — thường là
// localhost:8000 cho dev ngoài Docker).
const API_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const nextConfig = {
  // output: "standalone" chỉ dùng cho Docker/Node server.
  // Vercel tự build & serve nên không cần (tránh conflict với vercel.json).
  // Nếu deploy bằng Docker, bỏ comment dòng dưới:
  // output: "standalone",

  // Proxy /api/* → backend (giúp frontend gọi /api/auth/login từ cùng origin,
  // tránh CORS + cookie issues). LƯU Ý: Next.js rewrites KHÔNG forward custom
  // headers (Authorization) mặc định. Vì vậy với các route cần auth, dùng
  // route handler thủ công (xem src/app/api/**\/route.ts).
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
