import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const a = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  test: { testTimeout: 30000 },
  resolve: {
    alias: {
      '@redline/shared': a('../shared/src/index.ts'),
      '@redline/db': a('../db/src/index.ts'),
      '@redline/engine': a('../engine/src/index.ts'),
      '@redline/hunters': a('../hunters/src/index.ts'),
    },
  },
});
