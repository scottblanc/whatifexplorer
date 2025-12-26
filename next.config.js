/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['jstat'],
  },
};

module.exports = nextConfig;
