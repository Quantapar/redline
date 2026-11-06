'use client';

import { Providers } from '@/components/flow/providers';
import { OnboardingFlow } from '@/components/flow/onboarding/flow';

/**
 * The public opening of Redline for signed-out visitors: the ported onboarding
 * flow (Find → Confirm → Live Read → Verdict), wrapped in its own providers and
 * scoped under `.kobra-flow` so its design tokens apply here and nowhere else.
 */
export function FlowRoot() {
  return (
    <div className="kobra-flow min-h-dvh bg-background text-foreground">
      <Providers>
        <OnboardingFlow />
      </Providers>
    </div>
  );
}
