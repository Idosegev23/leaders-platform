/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for server components
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'pdf-lib', 'pdf-parse'],
    // Allow large file uploads (PDF briefs up to 20MB)
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  
  // Image optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      // IMAI returns Instagram / Meta CDN URLs for influencer profile
      // pics. These are signed and short-lived but Next still needs
      // the host whitelisted or it 400s the optimizer endpoint.
      { protocol: 'https', hostname: '*.cdninstagram.com' },
      { protocol: 'https', hostname: '*.fbcdn.net' },
      { protocol: 'https', hostname: 'instagram.com' },
      { protocol: 'https', hostname: 'www.instagram.com' },
    ],
  },

  // Webpack configuration for Puppeteer/Chromium
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'puppeteer-core': 'commonjs puppeteer-core',
        '@sparticuz/chromium': 'commonjs @sparticuz/chromium',
      })
    }
    return config
  },
}

module.exports = nextConfig
