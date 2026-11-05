import { Card } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { Icon } from '@/components/icon';
import { Shield01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';

export const dynamic = 'force-dynamic';

const EXAMPLE = `# .redline/policy.yml
version: 1
rules:
  - id: no-unguarded-money-move
    text: No function that moves money may run without a permission check.
    severity: critical
    appliesTo: ["withdraw*", "transfer*", "sweep*"]

  - id: warn-new-external-call-in-withdraw
    text: Warn me about any new outside call inside a withdraw function.
    severity: high
    appliesTo: ["withdraw*"]`;

const RULES = [
  'Write rules in plain English — no code, no config language to learn.',
  'On every scan the hunters are told to pay special attention to your rules.',
  'Anything that breaks a rule is flagged, even if no money moved yet.',
  'Manage it all with one command: redline policy.',
];

export default function PolicyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Icon icon={Shield01Icon} size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Security policy</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Every team has its own rules. Write them in plain English in a small file in your repo.
            Redline reads the file on every scan and flags anything that breaks them.
          </p>
        </div>
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-3 text-[13px] font-semibold">Your policy file</div>
        <div className="p-3">
          <CodeBlock code={EXAMPLE} language="sh" filename=".redline/policy.yml" />
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-[13px] font-semibold">How it works</div>
        <ul className="mt-3 space-y-2.5">
          {RULES.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-[13px] text-muted-foreground">
              <Icon icon={CheckmarkCircle02Icon} size={16} className="mt-0.5 shrink-0 text-[var(--success)]" />
              {r}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <div className="text-[13px] font-semibold">Manage from the terminal</div>
        <div className="mt-3">
          <CodeBlock
            code={`# add a rule\nredline policy add "No delegatecall to a non-constant address"\n\n# list rules\nredline policy list\n\n# remove a rule\nredline policy remove no-unguarded-money-move`}
            language="sh"
            filename="terminal"
          />
        </div>
      </Card>
    </div>
  );
}
