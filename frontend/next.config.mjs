/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empty = same-origin Next.js API routes (built-in engine). Override to the C++ REST service.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
  },
};

export default nextConfig;
