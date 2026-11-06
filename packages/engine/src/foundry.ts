import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

/**
 * The environment handed to forge / cast / anvil. The referee runs UNTRUSTED
 * attack code through these tools, and forge exposes the process environment to
 * Solidity via vm.envString & co. If the toolchain simply inherited process.env,
 * an attack could read the worker's secrets (router keys, RPC URLs, DB password)
 * and leak them through a log line. So only what the tools need to run is passed:
 * PATH (to find the binaries and solc), HOME (solc/forge caches), TMPDIR, and
 * Foundry's own config vars. Everything else is withheld.
 */
export function toolEnv(): NodeJS.ProcessEnv {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'FOUNDRY_DIR', 'FOUNDRY_PROFILE', 'SSL_CERT_FILE', 'SSL_CERT_DIR'];
  const env: Record<string, string> = {};
  for (const k of keep) {
    const v = process.env[k];
    if (v !== undefined) env[k] = v;
  }
  return env as unknown as NodeJS.ProcessEnv;
}

export interface FoundryInfo {
  available: boolean;
  forgeVersion: string | null;
  anvilVersion: string | null;
}

/** Detect whether the Foundry toolchain is installed on this machine. */
export async function detectFoundry(): Promise<FoundryInfo> {
  const tryVersion = async (bin: string): Promise<string | null> => {
    try {
      const { stdout } = await pexec(bin, ['--version'], { timeout: 10_000, env: toolEnv() });
      return stdout.trim().split('\n')[0] ?? null;
    } catch {
      return null;
    }
  };
  const [forge, anvil] = await Promise.all([tryVersion('forge'), tryVersion('anvil')]);
  return { available: Boolean(forge && anvil), forgeVersion: forge, anvilVersion: anvil };
}

/**
 * anvil's default deterministic dev accounts (the standard test mnemonic
 * "test test ... junk"). Each starts with 10,000 ETH. The referee uses the
 * first as the funded attacker EOA so the attack pays real gas from a real
 * balance — no cheatcode is needed or available to fund it.
 */
export const ANVIL_ACCOUNTS: ReadonlyArray<{ address: string; privateKey: string }> = [
  { address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' },
  { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' },
  { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' },
];

export interface AnvilHandle {
  rpcUrl: string;
  port: number;
  block: number;
  stop: () => Promise<void>;
}
/** @deprecated name kept for compatibility; a fork is just an anvil with --fork-url. */
export type ForkHandle = AnvilHandle;

interface LaunchOpts {
  /** when set, anvil forks this upstream; when omitted, a fresh local chain. */
  forkUrl?: string;
  block?: number;
  port?: number;
  mnemonic?: string;
  /** anvil binary name; overridable for tests */
  bin?: string;
  /** readiness timeout; the fork path needs longer because it pulls upstream state */
  readyTimeoutMs?: number;
}

/**
 * Launch an anvil node (forked or fresh) and resolve once it answers RPC. Shared
 * by startFork (the attack room, forked at a block) and startAnvil (a fresh chain
 * for self-contained execution). A node that emits 'error' with no listener would
 * crash the process; ENOENT (anvil not installed) is exactly that case, so it is
 * captured and surfaced as a clean throw instead.
 */
async function launchAnvil(opts: LaunchOpts): Promise<AnvilHandle> {
  const port = opts.port ?? 8545 + Math.floor(Math.random() * 1000);
  const args = ['--port', String(port), '--silent'];
  if (opts.forkUrl) args.push('--fork-url', opts.forkUrl);
  if (opts.block !== undefined) args.push('--fork-block-number', String(opts.block));
  if (opts.mnemonic) args.push('--mnemonic', opts.mnemonic);

  const child: ChildProcess = spawn(opts.bin ?? 'anvil', args, { stdio: 'ignore', env: toolEnv() });
  const spawnState: { error: Error | null } = { error: null };
  child.once('error', (err) => { spawnState.error = err; });
  const rpcUrl = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 30_000);
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
      // Connected but not answering with a result yet — wait before retrying so
      // this does not busy-spin the event loop.
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (spawnState.error) {
    throw new Error(`anvil failed to start: ${spawnState.error.message}`);
  }
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error(`anvil did not become ready within ${opts.readyTimeoutMs ?? 30_000}ms on port ${port}`);
  }

  return { rpcUrl, port, block, stop: async () => { child.kill('SIGTERM'); } };
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
  bin?: string;
}): Promise<AnvilHandle> {
  return launchAnvil({ ...opts });
}

/**
 * Start a fresh local anvil chain (no fork). Used by the broadcast executor to
 * run an attack as real transactions against deployed contracts when there is no
 * upstream to fork (tests, self-contained fixtures).
 */
export async function startAnvil(opts: { port?: number; mnemonic?: string; bin?: string } = {}): Promise<AnvilHandle> {
  return launchAnvil({ ...opts });
}

// ---- cast: real JSON-RPC transactions against an anvil node ----------------
// Every call below is an ordinary transaction or query against the node. The
// cheatcode precompile (0x7109...12d) is just a codeless address here, so any
// vm.* call inside a deployed contract is an inert no-op — this is the
// execution-level isolation the source-text scanner cannot guarantee on its own.
//
// SECURITY: a function signature and its call args may be candidate-influenced.
// execFile blocks SHELL injection but NOT cast/clap ARGUMENT injection: an arg
// like `--value 5ether` or `--unlocked` spliced into argv would let a fake
// "exploit" fund itself or impersonate a prefunded account and register as a
// theft. So the signature is checked against a strict shape and no call arg may
// look like a flag (leading `-`). Harness-controlled numeric/known values
// (valueWei, gasLimit) are not subject to this.

/** A plain function/constructor signature: `name(type,type)` — no flags, no shell. */
function assertSafeSig(sig: string): void {
  if (!/^(constructor|[A-Za-z_$][A-Za-z0-9_$]*)\([A-Za-z0-9_,.\[\]() ]*\)$/.test(sig)) {
    throw new Error(`unsafe cast signature: ${sig}`);
  }
}
/** Reject any call arg that could be parsed as a cast/clap option. */
function assertSafeArgs(args: readonly string[] | undefined): void {
  for (const a of args ?? []) {
    if (typeof a !== 'string' || a.startsWith('-')) {
      throw new Error(`unsafe cast argument (looks like a flag): ${String(a)}`);
    }
  }
}
/** A Solidity identifier used to build a filesystem path — no separators/traversal. */
function assertSafeContractName(name: string): void {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(`unsafe contract name: ${name}`);
  }
}

/** Read an address's native balance (wei, decimal string) at the node's head. */
export async function castBalance(rpcUrl: string, address: string, bin = 'cast'): Promise<string> {
  const { stdout } = await pexec(bin, ['balance', address, '--rpc-url', rpcUrl], { timeout: 20_000, env: toolEnv() });
  return stdout.trim();
}

/**
 * Deploy raw creation bytecode from a funded key via a real transaction and
 * return the deployed contract address.
 */
export async function castDeploy(opts: {
  rpcUrl: string;
  privateKey: string;
  bytecode: string;
  /** constructor signature + args, encoded and appended to the init code by cast. */
  constructorSig?: string;
  constructorArgs?: string[];
  valueWei?: string;
  bin?: string;
}): Promise<string> {
  const args = ['send', '--rpc-url', opts.rpcUrl, '--private-key', opts.privateKey, '--json', '--create', opts.bytecode];
  if (opts.constructorSig) {
    assertSafeSig(opts.constructorSig);
    assertSafeArgs(opts.constructorArgs);
    args.push(opts.constructorSig, ...(opts.constructorArgs ?? []));
  }
  if (opts.valueWei && opts.valueWei !== '0') args.push('--value', opts.valueWei);
  const { stdout } = await pexec(opts.bin ?? 'cast', args, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, env: toolEnv() });
  const receipt = JSON.parse(stdout) as { contractAddress?: string };
  if (!receipt.contractAddress) throw new Error('deploy produced no contractAddress');
  return receipt.contractAddress;
}

/** Send a real transaction calling `sig` with `args` (and optional value). */
export async function castSend(opts: {
  rpcUrl: string;
  privateKey: string;
  to: string;
  sig: string;
  args?: string[];
  valueWei?: string;
  gasLimit?: number;
  bin?: string;
}): Promise<{ status: boolean; raw: string }> {
  assertSafeSig(opts.sig);
  assertSafeArgs(opts.args);
  const a = ['send', '--rpc-url', opts.rpcUrl, '--private-key', opts.privateKey, '--json', opts.to, opts.sig, ...(opts.args ?? [])];
  if (opts.valueWei && opts.valueWei !== '0') a.push('--value', opts.valueWei);
  if (opts.gasLimit) a.push('--gas-limit', String(opts.gasLimit));
  try {
    const { stdout } = await pexec(opts.bin ?? 'cast', a, { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, env: toolEnv() });
    const receipt = JSON.parse(stdout) as { status?: string };
    // anvil returns "0x1" (success) or "0x0" (reverted) in the receipt status.
    return { status: receipt.status === '0x1' || receipt.status === '1', raw: stdout };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    return { status: false, raw: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

export interface ForgeTestResult {
  passed: boolean;
  raw: string;
  json: unknown;
}

/**
 * Run `forge test` for ONE test contract and return parsed JSON results.
 * `matchContract` is required and anchored (^...$) so a run can never pick up
 * the rest of a repository's suite: one unrelated failing test would otherwise
 * turn every candidate into did-not-move. This helper is a build/compile aid;
 * it is NOT a verdict source — the referee measures via broadcast transactions.
 */
export async function forgeTest(opts: {
  projectDir: string;
  matchContract: string;
  matchTest?: string;
  forkUrl?: string;
  forkBlock?: number;
  timeoutMs?: number;
}): Promise<ForgeTestResult> {
  assertSafeContractName(opts.matchContract);
  const args = ['test', '--json', '--match-contract', `^${opts.matchContract}$`];
  if (opts.matchTest) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(opts.matchTest)) throw new Error(`unsafe test name: ${opts.matchTest}`);
    args.push('--match-test', `^${opts.matchTest}$`);
  }
  if (opts.forkUrl) args.push('--fork-url', opts.forkUrl);
  if (opts.forkBlock) args.push('--fork-block-number', String(opts.forkBlock));
  try {
    const { stdout } = await pexec('forge', args, {
      cwd: opts.projectDir,
      timeout: opts.timeoutMs ?? 180_000,
      maxBuffer: 32 * 1024 * 1024,
      env: toolEnv(),
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

/** Compile a Foundry project (`forge build`). Throws with the compiler output on failure. */
export async function forgeBuild(opts: { projectDir: string; timeoutMs?: number; bin?: string }): Promise<void> {
  try {
    await pexec(opts.bin ?? 'forge', ['build'], {
      cwd: opts.projectDir,
      timeout: opts.timeoutMs ?? 180_000,
      maxBuffer: 32 * 1024 * 1024,
      env: toolEnv(),
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(`forge build failed: ${((e.stderr ?? '') + (e.stdout ?? '') || e.message || '').slice(0, 2000)}`);
  }
}

/**
 * Read a contract's CREATION bytecode from a built project. forge writes
 * out/<SourceFile>.sol/<Contract>.json; the source file name need not match the
 * contract name, so every out/<x>.sol/ dir is checked for <Contract>.json. The
 * name must be a bare identifier so a crafted value cannot read another file.
 */
export async function readArtifactBytecode(projectDir: string, contractName: string): Promise<string> {
  assertSafeContractName(contractName);
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const out = join(projectDir, 'out');
  const dirs = await readdir(out, { withFileTypes: true }).catch(() => []);
  const candidates = [
    join(out, `${contractName}.sol`, `${contractName}.json`),
    ...dirs.filter((d) => d.isDirectory()).map((d) => join(out, d.name, `${contractName}.json`)),
  ];
  for (const path of candidates) {
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      continue;
    }
    const artifact = JSON.parse(raw) as { bytecode?: { object?: string } };
    const bytecode = artifact.bytecode?.object;
    if (bytecode && bytecode !== '0x') return bytecode;
  }
  throw new Error(`no creation bytecode for ${contractName}`);
}

/** Compile a Foundry project and return a contract's creation bytecode. */
export async function forgeBuildArtifact(opts: {
  projectDir: string;
  contractName: string;
  timeoutMs?: number;
  bin?: string;
}): Promise<{ bytecode: string }> {
  assertSafeContractName(opts.contractName);
  await forgeBuild(opts);
  return { bytecode: await readArtifactBytecode(opts.projectDir, opts.contractName) };
}
