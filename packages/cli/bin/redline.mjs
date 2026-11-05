#!/usr/bin/env node
// Thin launcher: run the TypeScript CLI through tsx, resolved from node_modules.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'index.ts');
const require = createRequire(import.meta.url);

let status = 0;
try {
  const pkgPath = require.resolve('tsx/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.tsx;
  const tsxBin = join(dirname(pkgPath), binRel);
  const res = spawnSync(process.execPath, [tsxBin, entry, ...process.argv.slice(2)], { stdio: 'inherit' });
  status = res.status ?? 0;
} catch (err) {
  console.error('redline: could not locate tsx. Run `pnpm install` in the Redline repo first.');
  status = 1;
}
process.exit(status);
