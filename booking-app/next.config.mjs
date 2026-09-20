/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    // A cloud browser and the agent runtime both call the sandbox API from elsewhere.
    return [{ source: "/api/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }];
  },
};
export default nextConfig;
