/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_DISTDIR ? { distDir: process.env.NEXT_DISTDIR } : {}),
  transpilePackages: ['@redline/db', '@redline/shared', '@redline/hunters', '@redline/engine', '@redline/worker', '@redline/gates', '@redline/arkiv'],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // @hugeicons/core-free-icons' entry re-exports ~6,000 icon modules. Without
    // this, every page compiled the whole set in dev (~19k modules, ~7s cold).
    // Next rewrites `import { XIcon } from '…'` to the one icon module instead.
    optimizePackageImports: ['@hugeicons/core-free-icons', '@hugeicons/react', 'lucide-react'],
  },
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
