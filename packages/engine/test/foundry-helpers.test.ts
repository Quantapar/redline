import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFork, readArtifactBytecode, forgeTest, toolEnv } from '../src/foundry.js';

describe('startFork fails gracefully when anvil cannot spawn', () => {
  it('throws a clear error instead of crashing on an uncaught spawn error', async () => {
    // A non-existent binary makes spawn emit ENOENT; without the error listener this
    // would be an uncaught exception that crashes the process.
    await expect(
      startFork({ forkUrl: 'http://127.0.0.1:1', bin: 'anvil-not-installed-xyz', port: 18599 }),
    ).rejects.toThrow(/anvil failed to start/);
  });
});

describe('readArtifactBytecode — finds a contract whose file name differs', () => {
  it('reads out/<AnyFile>.sol/<Contract>.json and rejects a traversal name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'redline-art-'));
    await mkdir(join(dir, 'out', 'Vault.sol'), { recursive: true });
    await writeFile(join(dir, 'out', 'Vault.sol', 'EtherVault.json'), JSON.stringify({ bytecode: { object: '0x6080' } }));
    expect(await readArtifactBytecode(dir, 'EtherVault')).toBe('0x6080');
    await expect(readArtifactBytecode(dir, 'Missing')).rejects.toThrow(/no creation bytecode/);
    await expect(readArtifactBytecode(dir, '../etc')).rejects.toThrow(/unsafe/);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('forgeTest is scoped to one contract, never the whole suite', () => {
  it('refuses a contract or test name that is not a bare identifier', async () => {
    await expect(forgeTest({ projectDir: '/tmp', matchContract: 'A B' })).rejects.toThrow(/unsafe/);
    await expect(forgeTest({ projectDir: '/tmp', matchContract: 'Ok', matchTest: 'test.*' })).rejects.toThrow(/unsafe/);
  });
});

describe('toolEnv — forge/cast/anvil never inherit the worker secrets', () => {
  it('passes only the toolchain allowlist', () => {
    process.env.OG_ROUTER_API_KEY_TEST_ONLY = 'sk-should-not-leak';
    process.env.DATABASE_URL_TEST_ONLY = 'postgres://secret';
    const env = toolEnv();
    expect(env.OG_ROUTER_API_KEY_TEST_ONLY).toBeUndefined();
    expect(env.DATABASE_URL_TEST_ONLY).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH);
    delete process.env.OG_ROUTER_API_KEY_TEST_ONLY;
    delete process.env.DATABASE_URL_TEST_ONLY;
  });
});
