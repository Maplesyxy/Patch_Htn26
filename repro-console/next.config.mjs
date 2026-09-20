/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  ...(process.env.NEXT_PUBLIC_DEMO_ONLY === "1" ? { output: "export", trailingSlash: true } : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
