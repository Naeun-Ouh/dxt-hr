import type { NextConfig } from "next";
const config: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "17mb" } },
  poweredByHeader: false,
  outputFileTracingIncludes: {"/*": ["./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff"]},
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};
export default config;
