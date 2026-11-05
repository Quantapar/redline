import type { WeaknessClass } from '@redline/shared';

/** A fast static-analysis hit used to focus the hunters (not an alarm by itself). */
export interface AnalyzerHit {
  tool: 'slither' | 'aderyn';
  weaknessClass: WeaknessClass;
  contract: string;
  functionName: string | null;
  file: string;
  line: number | null;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

export interface AnalyzerResult {
  tool: 'slither' | 'aderyn';
  available: boolean;
  hits: AnalyzerHit[];
  raw: string;
}
