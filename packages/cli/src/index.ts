import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parsePolicy, serializePolicy, addRule, removeRule, STARTER_POLICY } from './policy.js';
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

Your security policy is plain English. Redline reads it on every scan and flags
anything that breaks it. No coding required.`;

export async function main(argv: string[]): Promise<number> {
  const [group, cmd, ...rest] = argv;
  if (!group || group === 'help' || group === '--help' || group === '-h') {
    console.log(HELP);
    return 0;
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
