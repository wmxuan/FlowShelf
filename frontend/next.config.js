/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 静态导出模式：生成纯 HTML/JS/CSS，由后端 FastAPI 直接托管
  // 不再需要 Next.js Server，部署时后端同时提供 API + 前端静态文件
  output: 'export',
  // 目录结构用 /cards/index.html 而非 /cards.html，
  // 方便 FastAPI StaticFiles(html=true) 正确路由
  trailingSlash: true,
};

module.exports = nextConfig;
