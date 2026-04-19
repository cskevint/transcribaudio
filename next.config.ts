import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/cron/cleanup-audio": ["./public/sample.ogg"],
  },
};

export default nextConfig;
