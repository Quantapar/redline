/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@redline/db', '@redline/shared', '@redline/hunters', '@redline/engine', '@redline/worker', '@redline/gates'],
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // Resolve the .js extensions our source-first workspace packages use to .ts.
    if (config.mode !== 'production') config.cache = false;
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
export default nextConfig;
