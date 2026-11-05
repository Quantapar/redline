import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const a = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  resolve: { alias: {
    '@redline/shared': a('../shared/src/index.ts'),
    '@redline/db': a('../db/src/index.ts'),
    '@redline/worker': a('../worker/src/index.ts'),
  } },
});
