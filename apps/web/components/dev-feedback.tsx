'use client';

import dynamic from 'next/dynamic';

// Local-only feedback toolbar: click any element, leave a note, and copy markdown
// with its selector, position and source context. Never rendered outside `next dev`.
const Agentation = dynamic(() => import('agentation').then((m) => m.Agentation), { ssr: false });

// Annotations sync to the agentation MCP server (registered in the repo's .mcp.json,
// started by the coding agent on :4747) so the agent can read them directly.
// Set NEXT_PUBLIC_AGENTATION_ENDPOINT to another URL, or to "" for copy-only mode.
const endpoint = process.env.NEXT_PUBLIC_AGENTATION_ENDPOINT ?? 'http://localhost:4747';

export function DevFeedback() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Agentation appName="Redline" endpoint={endpoint || undefined} />;
}
