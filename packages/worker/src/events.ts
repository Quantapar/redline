/** Live scan events, streamed to the dashboard (the "watch it as it happens" room). */
export type ScanEvent =
  | { type: 'status'; scanId: string; status: string; at: string }
  | { type: 'log'; scanId: string; message: string; at: string }
  | { type: 'candidate'; scanId: string; contract: string; weaknessClass: string; model: string; at: string }
  | { type: 'referee'; scanId: string; candidate: string; referee: string; outcome: string; at: string }
  | { type: 'finding'; scanId: string; findingId: string; isRed: boolean; consensus: string; title: string; at: string }
  | { type: 'done'; scanId: string; redCount: number; at: string };

export type EmitFn = (ev: ScanEvent) => void;
export const noopEmit: EmitFn = () => {};
