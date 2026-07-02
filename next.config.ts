import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // tree-shake react-icons / recharts — 아이콘 전체 대신 실제 사용 아이콘만 번들링
    optimizePackageImports: ["react-icons", "recharts"],
  },
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/auth/:path*`,
      },
      {
        source: "/api/windows/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/windows/:path*`,
      },
      {
        source: "/api/todos/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/todos/:path*`,
      },
      {
        source: "/api/timer/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/timer/:path*`,
      },
      {
        source: "/api/timer",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/timer`,
      },
    ];
  },
};

export default nextConfig;
