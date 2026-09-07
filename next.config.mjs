/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return ['/onboarding/status/:path*','/questionnaire/:path*','/teacher/:path*','/share-teacher/:path*','/admin/:path*'].map(source => ({
      source, headers: [{ key: 'Referrer-Policy', value: 'no-referrer' },{ key: 'X-Robots-Tag', value: 'noindex, nofollow' },{ key: 'Cache-Control', value: 'private, no-store' }],
    }));
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
