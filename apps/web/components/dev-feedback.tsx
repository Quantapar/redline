'use client';

import dynamic from 'next/dynamic';

// Local-only feedback toolbar: click any element, leave a note, and copy markdown
// with its selector, position and source context. Never rendered outside `next dev`.
const Agentation = dynamic(() => import('agentation').then((m) => m.Agentation), { ssr: false });

export function DevFeedback() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Agentation appName="Redline" />;
}
