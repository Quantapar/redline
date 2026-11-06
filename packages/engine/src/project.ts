import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rename, rm, writeFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { safeProjectPath } from './broadcast.js';
const pexec = promisify(execFile);

const FORGE_STD_MARKER = join('src', 'Test.sol');

/**
 * A hardened foundry.toml for referee projects. ffi and filesystem access are
 * off, so even if a cheat slipped past the stripper it could not run host
 * commands or touch the disk. The referee runs untrusted attack code, so this
 * is the blast-radius floor.
 */
export const FOUNDRY_TOML = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
ffi = false
fs_permissions = []
`;

/** Where a reusable forge-std lives so each scan does not reinstall it. */
function forgeStdCache(): string {
  return process.env.REDLINE_FORGE_STD_PATH || join(homedir(), '.cache', 'redline', 'forge-std');
}

/**
 * Make sure a forge-std checkout exists at the cache path, installing it once if
 * missing. Returns the cache path, or null if it could not be made available
 * (offline and not cached) — callers then skip the real-fork path.
 */
export async function ensureForgeStd(bin = 'forge'): Promise<string | null> {
  const cache = forgeStdCache();
  if (existsSync(join(cache, FORGE_STD_MARKER))) return cache;
  let scratch: string | null = null;
  try {
    scratch = await mkdtemp(join(tmpdir(), 'redline-forgestd-'));
    // forge install needs a project; a bare foundry.toml is enough.
    await writeFile(join(scratch, 'foundry.toml'), FOUNDRY_TOML, 'utf8');
    await pexec(bin, ['install', 'foundry-rs/forge-std', '--no-git'], { cwd: scratch, timeout: 180_000 });
    const installed = join(scratch, 'lib', 'forge-std');
    if (existsSync(join(installed, FORGE_STD_MARKER))) {
      // Populate the shared cache atomically: copy into a private staging dir, then
      // rename it into place. The marker (src/Test.sol) only ever appears via a
      // complete checkout, so a concurrent scan can never see a half-copied cache.
      await mkdir(dirname(cache), { recursive: true });
      const staging = `${cache}.staging-${randomUUID()}`;
      await cp(installed, staging, { recursive: true });
      try {
        await rename(staging, cache);
      } catch {
        // Another scan won the race and populated the cache first; drop ours.
        await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      }
    }
    return existsSync(join(cache, FORGE_STD_MARKER)) ? cache : null;
  } catch {
    return null;
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface ProjectTarget {
  /** repo-relative path of the contract (PR-author controlled) */
  file: string;
  /** the contract source at the scanned commit */
  source: string;
}

export interface RefereeProject {
  projectDir: string;
  /** true when forge-std is present, i.e. the project can compile forge-std tests */
  hasForgeStd: boolean;
  cleanup: () => Promise<void>;
}

/**
 * Build a throwaway Foundry project a referee can compile and run against: a
 * hardened foundry.toml, forge-std in lib/, and each changed contract written
 * under src/ (so attacks may import them; self-contained attacks that inline the
 * target also work). Every PR-author path is normalised through safeProjectPath,
 * so a crafted filename cannot escape the project directory. The caller owns the
 * lifecycle and must call cleanup().
 */
export async function prepareRefereeProject(
  targets: ProjectTarget[],
  opts: { forgeBin?: string } = {},
): Promise<RefereeProject> {
  const projectDir = await mkdtemp(join(tmpdir(), 'redline-referee-'));
  try {
    await mkdir(join(projectDir, 'src'), { recursive: true });
    await writeFile(join(projectDir, 'foundry.toml'), FOUNDRY_TOML, 'utf8');

    for (const t of targets) {
      if (!t.source || !t.file) continue;
      // Place each contract under src/. A path that escapes the project (absolute,
      // `..`, symlink) is DROPPED, not fatal: one malicious/malformed target must not
      // deny verification for every candidate in the scan. The attack that references
      // a dropped target simply fails to compile -> did-not-move (fail-closed).
      let dest: string;
      try {
        dest = safeProjectPath(join(projectDir, 'src'), t.file);
      } catch {
        continue;
      }
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, t.source, 'utf8');
    }

    // forge-std, symlinked from the shared cache (fast; no per-scan install).
    const cache = await ensureForgeStd(opts.forgeBin);
    let hasForgeStd = false;
    if (cache) {
      await mkdir(join(projectDir, 'lib'), { recursive: true });
      try {
        await symlink(cache, join(projectDir, 'lib', 'forge-std'), 'dir');
        hasForgeStd = true;
      } catch {
        // Fall back to a copy if symlinks are unavailable.
        await cp(cache, join(projectDir, 'lib', 'forge-std'), { recursive: true });
        hasForgeStd = true;
      }
    }

    return {
      projectDir,
      hasForgeStd,
      cleanup: async () => {
        await rm(projectDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    // Never orphan the temp dir if setup throws before we can hand back cleanup.
    await rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}
