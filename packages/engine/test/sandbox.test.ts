import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { LocalSandbox } from '../src/sandbox.js';

describe('LocalSandbox', () => {
  const box = new LocalSandbox('test-box', tmpdir());

  it('runs a command and captures stdout', async () => {
    const r = await box.exec('node', ['-e', 'process.stdout.write("hello")']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('hello');
    expect(r.timedOut).toBe(false);
  });

  it('reports a non-zero exit code without throwing', async () => {
    const r = await box.exec('node', ['-e', 'process.exit(3)']);
    expect(r.code).toBe(3);
  });

  it('captures stderr from a failing command', async () => {
    const r = await box.exec('node', ['-e', 'console.error("boom"); process.exit(1)']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('boom');
  });

  it('times out a hung command and flags it', async () => {
    const r = await box.exec('node', ['-e', 'setTimeout(()=>{}, 10000)'], { timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
  });

  it('passes env through to the command', async () => {
    const r = await box.exec('node', ['-e', 'process.stdout.write(process.env.REDLINE_T || "")'], { env: { REDLINE_T: 'xyz' } });
    expect(r.stdout).toBe('xyz');
  });
});
