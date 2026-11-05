import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * A sealed room for one scan: a throwaway environment that runs commands in
 * isolation and is wiped after. LocalSandbox is the dev implementation; the
 * same interface is met by Firecracker / Fly Machines / E2B / Modal in prod.
 */
export interface Sandbox {
  readonly id: string;
  readonly workdir: string;
  exec(cmd: string, args: string[], opts?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> }): Promise<ExecResult>;
  dispose(): Promise<void>;
}

export class LocalSandbox implements Sandbox {
  constructor(
    public readonly id: string,
    public readonly workdir: string,
  ) {}

  async exec(
    cmd: string,
    args: string[],
    opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {},
  ): Promise<ExecResult> {
    try {
      const { stdout, stderr } = await pexec(cmd, args, {
        cwd: opts.cwd ?? this.workdir,
        timeout: opts.timeoutMs ?? 120_000,
        env: { ...process.env, ...opts.env },
        maxBuffer: 32 * 1024 * 1024,
      });
      return { code: 0, stdout, stderr, timedOut: false };
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
      return {
        code: typeof e.code === 'number' ? e.code : 1,
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? String(err),
        timedOut: e.killed === true || e.signal === 'SIGTERM',
      };
    }
  }

  async dispose(): Promise<void> {
    // LocalSandbox leaves the workdir to the caller/tempdir cleanup.
  }
}
