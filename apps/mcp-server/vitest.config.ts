import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const a = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: { alias: {
    '@redline/shared': a('../../packages/shared/src/index.ts'),
    '@redline/db': a('../../packages/db/src/index.ts'),
  } },
});
