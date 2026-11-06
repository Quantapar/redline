import { FlowRoot } from '@/components/flow/flow-root';

export const dynamic = 'force-dynamic';

/**
 * Redline's one front door, signed in or not: the onboarding flow. It finds the
 * GitHub account, picks a repository, follows the real attack and shows the
 * scan's own report. The old dashboard is no longer linked from here.
 */
export default function HomePage() {
  return <FlowRoot />;
}
