import { writeFile, mkdir, mkdtemp, cp, symlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Candidate, RefereeRun, BalanceDelta } from '@redline/shared';
import type { RefereeEngine, RefereeInput } from './referee.js';
import { stripForReferee, scanCheats } from './cheatcodes.js';
import { attackerGained } from '@redline/shared';
import { detectFoundry, forgeTest } from './foundry.js';
import { FOUNDRY_TOML } from './project.js';

export function wrapTest(candidate: Candidate, cleaned: string, contractName: string): string {
  if (/contract\s+\w+\s+is\s+Test/.test(cleaned) || /contract\s+\w+Test/.test(cleaned)) return cleaned;
  // Wrap a bare function/body into a forge-std test contract.
  const body = /function\s+test/i.test(cleaned) ? cleaned : `function test_Redline() public {\n${cleaned}\n}`;
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
contract Redline_${contractName}_Referee is Test {
${body}
}`;
}

/** Parse an optional net-value marker emitted by the attack: console.log("REDLINE_NET", x). */
export function parseNet(raw: string): string | null {
  const m = raw.match(/REDLINE_NET[^\d-]*(-?\d+)/);
  return m ? m[1]! : null;
}

/**
 * Real referee: runs the stripped attack as a forge test on a fresh fork. A test
 * is authored to PASS only when the exploit truly moves value, so a passing run
 * is the fact "money moved". Cheat shortcuts are stripped first.
 */
export class FoundryRefereeEngine implements RefereeEngine {
  async run(input: RefereeInput): Promise<RefereeRun> {
    const now = () => new Date().toISOString();
    const base: RefereeRun = {
      id: `${input.candidate.id}:${input.refereeName}`,
      candidateId: input.candidate.id,
      refereeName: input.refereeName,
      provider: input.provider,
      forkBlock: input.forkBlock ?? 0,
      outcome: 'error',
      thresholdWei: input.thresholdWei,
      deltas: [],
      traceRef: null,
      logsRef: null,
      startedAt: now(),
      finishedAt: null,
      error: null,
    };

    const { cleaned } = stripForReferee(input.candidate.forgeTest);

    // Defense in depth for the plain-transactions rule, checked before anything
    // else: never run code the stripper could not fully clean. A cheat split
    // across lines cannot be pinned to a single line and so survives
    // stripForReferee; rather than run it on the fork with the cheat active, the
    // referee refuses. An error run is not a valid vote, so a cheat-bearing
    // candidate detected here can never reach a red verdict.
    //
    // This is NOT the whole guarantee. scanCheats is a source-text scanner and
    // can be evaded by cheat access that leaves no literal token (see the SECURITY
    // note in cheatcodes.ts). The trustworthy isolation is execution-level: running
    // the attack as broadcast transactions where the cheatcode precompile is inert.
    // That engine now exists and is proven in `broadcast.ts` (runBroadcastExploit);
    // swapping this forge-test measurement over to it is tracked in SECURITY.md.
    if (scanCheats(cleaned).hasForbidden) {
      return { ...base, outcome: 'error', finishedAt: now(), error: 'forbidden cheat survived stripping; referee refuses cheat-bearing run' };
    }

    const foundry = await detectFoundry();
    if (!foundry.available) {
      return { ...base, outcome: 'build-failed', finishedAt: now(), error: 'foundry not installed' };
    }
    if (!input.projectDir) {
      return { ...base, outcome: 'error', finishedAt: now(), error: 'no prepared project dir' };
    }

    const testName = `Redline_${input.refereeName}`;
    // Each referee runs in its own throwaway working dir that shares the prepared
    // base project's src/ and lib/ (forge-std) by symlink but holds only this
    // referee's test. Concurrent referees then never compile or clobber each
    // other's attack files, and a compile error in one cannot fail the others.
    let runDir: string | null = null;
    try {
      runDir = await mkdtemp(join(tmpdir(), 'redline-run-'));
      // Write the hardened config directly (ffi off, no fs access) rather than
      // copying the base's, so the blast-radius floor is guaranteed for every run.
      await writeFile(join(runDir, 'foundry.toml'), FOUNDRY_TOML, 'utf8');
      for (const sub of ['src', 'lib']) {
        const from = join(input.projectDir, sub);
        if (!existsSync(from)) continue;
        try {
          await symlink(from, join(runDir, sub), 'dir');
        } catch {
          await cp(from, join(runDir, sub), { recursive: true });
        }
      }
      const dir = join(runDir, 'test');
      await mkdir(dir, { recursive: true });
      const wrapped = wrapTest(input.candidate, cleaned, input.candidate.targetContract);
      await writeFile(join(dir, `${testName}.t.sol`), wrapped, 'utf8');

      const result = await forgeTest({
        projectDir: runDir,
        matchTest: 'test',
        forkUrl: input.forkUrl,
        forkBlock: input.forkBlock,
        timeoutMs: 180_000,
      });

      if (result.passed) {
        // The test passing is necessary but not sufficient: the council votes on the
        // FACT that value met the threshold, measured from the attack's own emitted
        // net. A pass that moves nothing (or below threshold) is NOT a theft.
        const parsed = parseNet(result.raw);
        const net = parsed ?? '0';
        const delta: BalanceDelta = {
          token: 'native',
          attackerBefore: '0',
          attackerAfter: net,
          targetBefore: net,
          targetAfter: '0',
          attackerNetOfGas: net,
        };
        const moved = attackerGained([delta], input.thresholdWei);
        if (moved) {
          return { ...base, outcome: 'moved', deltas: [delta], finishedAt: now(), traceRef: `forge://${testName}` };
        }
        // Passed, but no value at or above the threshold actually moved.
        return { ...base, outcome: 'did-not-move', deltas: [delta], finishedAt: now(), traceRef: `forge://${testName}` };
      }
      if (/compil|parser|error\[/i.test(result.raw)) {
        return { ...base, outcome: 'build-failed', finishedAt: now(), error: 'compile error' };
      }
      return { ...base, outcome: 'did-not-move', finishedAt: now() };
    } catch (err) {
      return { ...base, outcome: 'error', finishedAt: now(), error: String(err).slice(0, 300) };
    } finally {
      if (runDir) await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
