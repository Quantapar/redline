/**
 * Referees must run an attack as plain, real transactions from one ordinary
 * wallet. Hunter shortcuts that fabricate advantage — handing the attacker free
 * money, impersonating other accounts, or rewriting chain state — must not
 * exist in the referee's room. This module detects them, tolerant of whitespace
 * and comments so an attack cannot hide a cheat as `vm . deal(` or behind `/* *\/`.
 */

/** Cheatcodes that grant unearned capability and are forbidden in referee runs. */
export const FORBIDDEN_CHEATS = [
  'vm.deal', 'vm.prank', 'vm.startPrank', 'vm.stopPrank', 'vm.store', 'vm.load',
  'vm.etch', 'vm.mockCall', 'vm.mockCallRevert', 'vm.setNonce', 'vm.coinbase',
  'deal(', 'hoax(', 'startHoax(', 'vm.broadcast', 'vm.startBroadcast',
] as const;

/** Environmental cheats that are tolerated (time/block only), listed for clarity. */
export const TOLERATED_CHEATS = ['vm.warp', 'vm.roll', 'vm.fee', 'vm.chainId'] as const;

// Build a whitespace-tolerant matcher for each cheat token.
function toRegex(token: string): RegExp {
  if (token.endsWith('(')) {
    // bare helper like deal( / hoax( / startHoax(
    const name = token.slice(0, -1);
    return new RegExp(`(^|[^A-Za-z0-9_.])${name}\\s*\\(`);
  }
  // vm.<name> — tolerate spaces around the dot
  const [, name] = token.split('.');
  return new RegExp(`\\bvm\\s*\\.\\s*${name}\\b`);
}
const FORBIDDEN_RES = FORBIDDEN_CHEATS.map((c) => ({ cheat: c, re: toRegex(c) }));
const TOLERATED_RES = TOLERATED_CHEATS.map((c) => ({ cheat: c, re: toRegex(c) }));

export interface CheatFinding {
  cheat: string;
  line: number; // 1-based; 0 means detected across lines / not pinned to one line
  text: string;
}

export interface CheatScan {
  forbidden: CheatFinding[];
  tolerated: CheatFinding[];
  hasForbidden: boolean;
}

/** Remove // line comments and /* *\/ block comments without changing line count. */
function stripComments(source: string): string {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlock
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

export function scanCheats(source: string): CheatScan {
  const clean = stripComments(source);
  const lines = clean.split('\n');
  const forbidden: CheatFinding[] = [];
  const tolerated: CheatFinding[] = [];

  const pinLine = (re: RegExp): number => {
    const idx = lines.findIndex((l) => re.test(l));
    return idx === -1 ? 0 : idx + 1;
  };

  // Collapse newlines so a call split across lines is still caught.
  const collapsed = clean.replace(/\s+/g, ' ');
  for (const { cheat, re } of FORBIDDEN_RES) {
    const flat = new RegExp(re.source);
    if (flat.test(collapsed)) {
      const line = pinLine(re);
      forbidden.push({ cheat, line, text: (lines[line - 1] ?? '').trim() });
    }
  }
  for (const { cheat, re } of TOLERATED_RES) {
    if (re.test(collapsed)) {
      const line = pinLine(re);
      tolerated.push({ cheat, line, text: (lines[line - 1] ?? '').trim() });
    }
  }
  return { forbidden, tolerated, hasForbidden: forbidden.length > 0 };
}

/**
 * Produce the referee's version of an attack: lines bearing a forbidden cheat are
 * removed. A cheat split across lines that cannot be pinned to one line removes
 * nothing, but scanCheats still flags it so the engines treat the candidate as
 * cheat-bearing (and the simulation refuses to reproduce it).
 */
export function stripForReferee(source: string): { cleaned: string; removed: CheatFinding[] } {
  const scan = scanCheats(source);
  const removedLines = new Set(scan.forbidden.map((f) => f.line).filter((n) => n > 0));
  const cleaned = source
    .split('\n')
    .filter((_, i) => !removedLines.has(i + 1))
    .join('\n');
  return { cleaned, removed: scan.forbidden };
}
