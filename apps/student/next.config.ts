import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@headless-lms/sdk", "@headless-lms/content-plate"],
  allowedDevOrigins: ["mliu", "mliu.tail731318.ts.net", "*.tail731318.ts.net"],
};

export default nextConfig;
