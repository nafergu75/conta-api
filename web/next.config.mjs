/** @type {import('next').NextConfig} */
const API_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:3000';

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/conta/:path*',
        destination: `${API_TARGET}/:path*`,
      },
    ];
  },
};

export default nextConfig;
