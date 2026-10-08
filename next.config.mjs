/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return ['/onboarding/status/:path*','/questionnaire/:path*','/teacher/:path*','/share-teacher/:path*','/admin/:path*','/therapy/:path*','/therapist/:path*'].map(source => ({
      source, headers: [{ key: 'Referrer-Policy', value: 'no-referrer' },{ key: 'X-Robots-Tag', value: 'noindex, nofollow' },{ key: 'Cache-Control', value: 'private, no-store' }],
    }));
  },
  experimental: {
    outputFileTracingIncludes: { '/api/admin/development': ['./public/development-original/**', './public/fonts/**'] },
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
