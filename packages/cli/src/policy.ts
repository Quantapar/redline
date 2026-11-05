import { parse, stringify } from 'yaml';
import { Policy, type PolicyRule, DEFAULT_POLICY } from '@redline/shared';

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'rule';
}

/** Parse a policy YAML string into a validated Policy (falls back to default). */
export function parsePolicy(yamlText: string): Policy {
  if (!yamlText.trim()) return { ...DEFAULT_POLICY };
  const raw = parse(yamlText);
  const result = Policy.safeParse(raw);
  if (!result.success) throw new Error(`invalid policy file: ${result.error.issues[0]?.message ?? 'parse error'}`);
  return result.data;
}

export function serializePolicy(policy: Policy): string {
  return stringify(policy);
}

export function addRule(
  policy: Policy,
  input: { text: string; severity?: PolicyRule['severity']; appliesTo?: string[]; id?: string },
): Policy {
  const id = input.id ?? slugify(input.text);
  if (policy.rules.some((r) => r.id === id)) throw new Error(`a rule with id "${id}" already exists`);
  const rule: PolicyRule = {
    id,
    text: input.text,
    severity: input.severity ?? 'high',
    appliesTo: input.appliesTo ?? [],
  };
  return { ...policy, rules: [...policy.rules, rule] };
}

export function removeRule(policy: Policy, id: string): Policy {
  if (!policy.rules.some((r) => r.id === id)) throw new Error(`no rule with id "${id}"`);
  return { ...policy, rules: policy.rules.filter((r) => r.id !== id) };
}

export const STARTER_POLICY: Policy = {
  version: 1,
  rules: [
    { id: 'no-unguarded-money-move', text: 'No function that moves money may run without a permission check.', severity: 'critical', appliesTo: ['withdraw*', 'transfer*', 'sweep*'] },
    { id: 'warn-new-external-call-in-withdraw', text: 'Warn about any new outside call inside a withdraw function.', severity: 'high', appliesTo: ['withdraw*'] },
  ],
};
