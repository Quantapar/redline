/**
 * Referees must run an attack as plain, real transactions from one ordinary
 * wallet. Hunter shortcuts that fabricate advantage — handing the attacker free
 * money, impersonating other accounts, or rewriting chain state — must not
 * exist in the referee's room. This module detects them.
 */

/** Cheatcodes that grant unearned capability and are forbidden in referee runs. */
export const FORBIDDEN_CHEATS = [
  'vm.deal', 'vm.prank', 'vm.startPrank', 'vm.stopPrank', 'vm.store', 'vm.load',
  'vm.etch', 'vm.mockCall', 'vm.mockCallRevert', 'vm.setNonce', 'vm.coinbase',
  'deal(', 'hoax(', 'startHoax(', 'vm.broadcast', 'vm.startBroadcast',
] as const;

/** Environmental cheats that are tolerated (time/block only), listed for clarity. */
export const TOLERATED_CHEATS = ['vm.warp', 'vm.roll', 'vm.fee', 'vm.chainId'] as const;

export interface CheatFinding {
  cheat: string;
  line: number;
  text: string;
}

export interface CheatScan {
  forbidden: CheatFinding[];
  tolerated: CheatFinding[];
  /** true if the attack, as written, leans on a forbidden shortcut */
  hasForbidden: boolean;
}

export function scanCheats(source: string): CheatScan {
  const lines = source.split('\n');
  const forbidden: CheatFinding[] = [];
  const tolerated: CheatFinding[] = [];
  lines.forEach((text, i) => {
    const stripped = text.replace(/\/\/.*$/, ''); // ignore comments
    for (const c of FORBIDDEN_CHEATS) {
      if (stripped.includes(c)) forbidden.push({ cheat: c, line: i + 1, text: text.trim() });
    }
    for (const c of TOLERATED_CHEATS) {
      if (stripped.includes(c)) tolerated.push({ cheat: c, line: i + 1, text: text.trim() });
    }
  });
  return { forbidden, tolerated, hasForbidden: forbidden.length > 0 };
}

/**
 * Produce the referee's version of an attack: forbidden cheat lines removed.
 * If the exploit truly depended on them, the stripped attack will simply fail
 * to move money in the referee's room — which is exactly the point.
 */
export function stripForReferee(source: string): { cleaned: string; removed: CheatFinding[] } {
  const scan = scanCheats(source);
  const removedLines = new Set(scan.forbidden.map((f) => f.line));
  const cleaned = source
    .split('\n')
    .filter((_, i) => !removedLines.has(i + 1))
    .join('\n');
  return { cleaned, removed: scan.forbidden };
}
