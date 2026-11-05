import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parsePolicy, serializePolicy, addRule, removeRule, STARTER_POLICY } from './policy.js';
import { detectTargets, loadProjectPolicy, runLocalScan, isDir } from './scan.js';
import type { Severity } from '@redline/shared';

const POLICY_PATH = '.redline/policy.yml';

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = args[i + 1] && !args[i + 1]!.startsWith('--') ? args[++i]! : 'true';
      flags[key] = val;
    } else positional.push(a);
  }
  return { positional, flags };
}

async function loadPolicy(): Promise<ReturnType<typeof parsePolicy>> {
  try {
    return parsePolicy(await readFile(POLICY_PATH, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, rules: [] };
    throw err;
  }
}

async function savePolicy(policy: ReturnType<typeof parsePolicy>): Promise<void> {
  await mkdir(dirname(POLICY_PATH), { recursive: true });
  await writeFile(POLICY_PATH, serializePolicy(policy), 'utf8');
}

const HELP = `redline — proof, not opinion

Usage:
  redline policy list
  redline policy add "<rule in plain English>" [--severity critical|high|medium|low] [--applies-to "withdraw*,transfer*"] [--id <slug>]
  redline policy remove <id>
  redline policy init        create a starter ${POLICY_PATH}

  redline scan <dir>         hunt + council over a local Solidity project
                             [--budget <cents>] [--sim]

Your security policy is plain English. Redline reads it on every scan and flags
anything that breaks it. No coding required.`;

export async function main(argv: string[]): Promise<number> {
  const [group, cmd, ...rest] = argv;
  if (!group || group === 'help' || group === '--help' || group === '-h') {
    console.log(HELP);
    return 0;
  }
  if (group === 'scan') {
    const { positional, flags } = parseFlags([cmd ?? '', ...rest].filter(Boolean));
    const dir = positional[0] ?? '.';
    if (!(await isDir(dir))) { console.error(`not a directory: ${dir}`); return 1; }
    if (!process.env.OG_ROUTER_API_KEY) { console.error('set OG_ROUTER_API_KEY to run a scan.'); return 1; }
    const targets = await detectTargets(dir);
    if (targets.length === 0) { console.log('no Solidity contracts found.'); return 0; }
    const policy = await loadProjectPolicy(dir);
    console.log(`scanning ${targets.length} contract(s) in ${dir}...`);
    try {
      const report = await runLocalScan({
        targets,
        policy,
        budgetCents: Number(flags.budget ?? 500),
        forceSimulation: flags.sim === 'true',
        onProgress: (m) => console.log(`  ${m}`),
      });
      console.log(`\n${report.candidateCount} candidate(s), ${report.red.length} reproduced (red). spent ~${report.spentCents}c.`);
      for (const r of report.red) {
        console.log(`  RED [${r.weaknessClass}] ${r.contract} — council ${r.agreement}`);
        console.log(`      ${r.summary}`);
      }
      if (report.candidateCount > 0 && report.red.length === 0) {
        console.log('\nNo theft was reproduced. Install Foundry (forge/anvil) for the real');
        console.log('fork-based council — candidates are only proven by actually moving the money.');
      }
      return report.red.length > 0 ? 2 : 0;
    } catch (err) {
      console.error(`scan failed: ${(err as Error).message}`);
      return 1;
    }
  }

  if (group !== 'policy') {
    console.error(`unknown command: ${group}\n`);
    console.log(HELP);
    return 1;
  }

  const { positional, flags } = parseFlags(rest);

  try {
    if (cmd === 'init') {
      await savePolicy(STARTER_POLICY);
      console.log(`wrote ${POLICY_PATH} with ${STARTER_POLICY.rules.length} starter rules.`);
      return 0;
    }
    if (cmd === 'list') {
      const policy = await loadPolicy();
      if (policy.rules.length === 0) { console.log('no rules yet. add one with: redline policy add "<rule>"'); return 0; }
      for (const r of policy.rules) {
        console.log(`• [${r.severity}] ${r.id}`);
        console.log(`    ${r.text}`);
        if (r.appliesTo.length) console.log(`    applies to: ${r.appliesTo.join(', ')}`);
      }
      return 0;
    }
    if (cmd === 'add') {
      const text = positional[0];
      if (!text) { console.error('usage: redline policy add "<rule>"'); return 1; }
      const appliesTo = flags['applies-to'] ? flags['applies-to'].split(',').map((s) => s.trim()).filter(Boolean) : [];
      const policy = addRule(await loadPolicy(), {
        text,
        severity: (flags.severity as Severity) ?? 'high',
        appliesTo,
        id: flags.id,
      });
      await savePolicy(policy);
      console.log(`added rule "${policy.rules.at(-1)!.id}".`);
      return 0;
    }
    if (cmd === 'remove') {
      const id = positional[0];
      if (!id) { console.error('usage: redline policy remove <id>'); return 1; }
      await savePolicy(removeRule(await loadPolicy(), id));
      console.log(`removed rule "${id}".`);
      return 0;
    }
    console.error(`unknown policy command: ${cmd ?? ''}\n`);
    console.log(HELP);
    return 1;
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 1;
  }
}

// Entry when run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
