import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/index.js';

let dir = '';
const origCwd = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'redline-cli-'));
  process.chdir(dir);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('redline CLI main()', () => {
  it('prints help with no args', async () => {
    expect(await main([])).toBe(0);
  });
  it('init writes a starter policy file', async () => {
    expect(await main(['policy', 'init'])).toBe(0);
    expect(existsSync(join(dir, '.redline', 'policy.yml'))).toBe(true);
    expect(readFileSync(join(dir, '.redline', 'policy.yml'), 'utf8')).toContain('no-unguarded-money-move');
  });
  it('add then remove a rule', async () => {
    await main(['policy', 'init']);
    expect(await main(['policy', 'add', 'No delegatecall to a non-constant address', '--severity', 'critical'])).toBe(0);
    expect(readFileSync(join(dir, '.redline', 'policy.yml'), 'utf8')).toContain('no-delegatecall-to-a-non-constant-address');
    expect(await main(['policy', 'remove', 'no-delegatecall-to-a-non-constant-address'])).toBe(0);
    expect(readFileSync(join(dir, '.redline', 'policy.yml'), 'utf8')).not.toContain('no-delegatecall-to-a-non-constant-address');
  });
  it('add with no text returns an error code', async () => {
    expect(await main(['policy', 'add'])).toBe(1);
  });
  it('an unknown group returns an error code', async () => {
    expect(await main(['frobnicate'])).toBe(1);
  });
  it('scan on a non-directory returns an error code', async () => {
    expect(await main(['scan', join(dir, 'does-not-exist')])).toBe(1);
  });
});
