/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: "standalone" chỉ dùng cho Docker/Node server.
  // Vercel tự build & serve nên không cần (tránh conflict với vercel.json).
  // Nếu deploy bằng Docker, bỏ comment dòng dưới:
  // output: "standalone",
};

module.exports = nextConfig;
