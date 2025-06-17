import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
