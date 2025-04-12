import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // allowedDevOrigins should be a top-level property
  // Allow access from any origin for development (use with caution)
  allowedDevOrigins: ["*"],
  // If you prefer to be specific:
  // allowedDevOrigins: ["http://10.20.31.74:3000"], 
};

export default nextConfig;
