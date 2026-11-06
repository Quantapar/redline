import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export interface FoundryInfo {
  available: boolean;
  forgeVersion: string | null;
  anvilVersion: string | null;
}

/** Detect whether the Foundry toolchain is installed on this machine. */
export async function detectFoundry(): Promise<FoundryInfo> {
  const tryVersion = async (bin: string): Promise<string | null> => {
    try {
      const { stdout } = await pexec(bin, ['--version'], { timeout: 10_000 });
      return stdout.trim().split('\n')[0] ?? null;
    } catch {
      return null;
    }
  };
  const [forge, anvil] = await Promise.all([tryVersion('forge'), tryVersion('anvil')]);
  return { available: Boolean(forge && anvil), forgeVersion: forge, anvilVersion: anvil };
}

export interface ForkHandle {
  rpcUrl: string;
  port: number;
  block: number;
  stop: () => Promise<void>;
}

/**
 * Start an anvil fork of a chain at a given block — the attack room. Each
 * referee gets its own fresh fork, ideally at a different block and through a
 * different upstream provider.
 */
export async function startFork(opts: {
  forkUrl: string;
  block?: number;
  port?: number;
  mnemonic?: string;
  /** anvil binary name; overridable for tests */
  bin?: string;
}): Promise<ForkHandle> {
  const port = opts.port ?? 8545 + Math.floor(Math.random() * 1000);
  const args = ['--fork-url', opts.forkUrl, '--port', String(port), '--silent'];
  if (opts.block) args.push('--fork-block-number', String(opts.block));
  if (opts.mnemonic) args.push('--mnemonic', opts.mnemonic);

  const child: ChildProcess = spawn(opts.bin ?? 'anvil', args, { stdio: 'ignore' });
  // A ChildProcess that emits 'error' with no listener throws an uncaught exception
  // that crashes the process. anvil not being installed (spawn ENOENT) is exactly
  // that case, so capture it and fail gracefully instead.
  const spawnState: { error: Error | null } = { error: null };
  child.once('error', (err) => { spawnState.error = err; });
  const rpcUrl = `http://127.0.0.1:${port}`;

  // Wait until the fork responds to eth_blockNumber.
  const deadline = Date.now() + 30_000;
  let block = opts.block ?? 0;
  let ready = false;
  while (Date.now() < deadline) {
    if (spawnState.error) break; // anvil could not start (e.g., not installed)
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_blockNumber' }),
      });
      const json = (await res.json()) as { result?: string };
      if (json.result) {
        block = parseInt(json.result, 16);
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (spawnState.error) {
    throw new Error(`anvil failed to start: ${spawnState.error.message}`);
  }
  if (!ready) {
    // Partially started but never answered — kill it so we don't leak the process.
    child.kill('SIGTERM');
    throw new Error(`anvil fork did not become ready within 30s on port ${port}`);
  }

  return {
    rpcUrl,
    port,
    block,
    stop: async () => {
      child.kill('SIGTERM');
    },
  };
}

export interface ForgeTestResult {
  passed: boolean;
  raw: string;
  json: unknown;
}

/**
 * Run `forge test` against a project and return parsed JSON results.
 * `matchTest` narrows to one test (the candidate attack).
 */
export async function forgeTest(opts: {
  projectDir: string;
  matchTest?: string;
  forkUrl?: string;
  forkBlock?: number;
  timeoutMs?: number;
}): Promise<ForgeTestResult> {
  const args = ['test', '--json'];
  if (opts.matchTest) args.push('--match-test', opts.matchTest);
  if (opts.forkUrl) args.push('--fork-url', opts.forkUrl);
  if (opts.forkBlock) args.push('--fork-block-number', String(opts.forkBlock));
  try {
    const { stdout } = await pexec('forge', args, {
      cwd: opts.projectDir,
      timeout: opts.timeoutMs ?? 180_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    let json: unknown = null;
    try {
      json = JSON.parse(stdout);
    } catch {
      /* non-json tail */
    }
    return { passed: true, raw: stdout, json };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    let json: unknown = null;
    try {
      if (e.stdout) json = JSON.parse(e.stdout);
    } catch {
      /* ignore */
    }
    return { passed: false, raw: (e.stdout ?? '') + (e.stderr ?? ''), json };
  }
}
