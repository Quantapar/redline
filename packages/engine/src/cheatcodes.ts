/**
 * Referees must run an attack as plain, real transactions from one ordinary
 * wallet. Hunter shortcuts that fabricate advantage — handing the attacker free
 * money, impersonating other accounts, or rewriting chain state — must not
 * exist in the referee's room. This module detects them, tolerant of whitespace
 * and comments so an attack cannot hide a cheat as `vm . deal(` or behind `/* *\/`.
 *
 * SECURITY — scope and limits of this detector (read before trusting it):
 * This is a SOURCE-TEXT scanner. It catches the common and the obvious — the
 * inherited `vm`/`hevm` handle, bare forge-std helpers, aliasing the `Vm`
 * interface, and any reference to the cheatcode precompile address. It CANNOT
 * be the sole guarantee: a sufficiently determined hunter can still reach the
 * cheatcode precompile through means that leave no literal token (e.g. computing
 * the precompile address arithmetically, or a raw assembly call built from
 * runtime values). Treat this module as DEFENSE IN DEPTH only. The real
 * two-room guarantee must come from EXECUTION-LEVEL isolation: the referee runs
 * the attack as broadcast transactions from a funded EOA against the fork, where
 * the cheatcode precompile is inert (a call to 0x7109… hits empty code and does
 * nothing), so a cheat-dependent "exploit" simply fails to move money. Until the
 * Foundry path runs attacks that way, a red verdict from it is NOT fully trusted.
 * See docs/SECURITY.md and docs/NEED-FROM-YOU.md.
 */

/**
 * Cheatcodes that grant unearned capability and are forbidden in referee runs.
 * Three classes: value/impersonation/state (deal, prank, store, etch, …),
 * broadcast, and SYSTEM ACCESS (ffi, filesystem, env, arbitrary bytecode).
 * A plain-transaction referee attack has no legitimate reason to touch any of
 * them. `vm.ffi` is the most dangerous — it runs arbitrary shell commands on the
 * referee host, so it is both a cheat and a remote-code-execution risk in a
 * sandbox that runs untrusted hunter tests; it must stay forbidden AND be
 * disabled at the forge-config level (ffi = false, empty fs_permissions) when the
 * real fork path is wired. See the SECURITY note above.
 */
export const FORBIDDEN_CHEATS = [
  'vm.deal', 'vm.prank', 'vm.startPrank', 'vm.stopPrank', 'vm.store', 'vm.load',
  'vm.etch', 'vm.mockCall', 'vm.mockCallRevert', 'vm.setNonce', 'vm.coinbase',
  'deal(', 'hoax(', 'startHoax(', 'vm.broadcast', 'vm.startBroadcast',
  'changePrank(', 'deployCode(',
  // system access — RCE, filesystem, env, arbitrary bytecode
  'vm.ffi', 'vm.readFile', 'vm.writeFile', 'vm.removeFile', 'vm.closeFile',
  'vm.setEnv', 'vm.getCode', 'vm.getDeployedCode',
] as const;

/** Environmental cheats that are tolerated (time/block only), listed for clarity. */
export const TOLERATED_CHEATS = ['vm.warp', 'vm.roll', 'vm.fee', 'vm.chainId'] as const;

/**
 * Structural signals that grant the WHOLE cheatcode API regardless of method
 * name, so they are forbidden wholesale — this is what defeats handle-aliasing
 * (`Vm V = Vm(0x7109…); V.deal(…)`) and raw precompile calls that never spell
 * out a cheat name. The canonical forge cheatcode precompile address is the one
 * invariant every cheat route shares.
 */
const VM_ACCESS_RES: { cheat: string; re: RegExp }[] = [
  // Any reference to the cheatcode precompile address (case-insensitive), however
  // the call is then made (aliased handle, abi.encodeWithSelector, assembly).
  { cheat: 'cheatcode-precompile-address', re: /0x7109709ecfa91a80626ff3989d68f67f5b1dd12d/i },
  // Casting to the Vm / IVm / Hevm cheat interface grabs the full API under any name.
  { cheat: 'vm-interface-cast', re: /\b(?:I?Vm|Hevm)\s*\(/ },
  // Declaring a local of the cheat-interface type (incl. copying the inherited handle).
  { cheat: 'vm-handle-alias', re: /\b(?:I?Vm|Hevm)\s+[A-Za-z_]\w*\s*=/ },
];

// Build a whitespace-tolerant matcher for each cheat token.
function toRegex(token: string): RegExp {
  if (token.endsWith('(')) {
    // bare helper like deal( / hoax( / startHoax( / changePrank( / deployCode(
    const name = token.slice(0, -1);
    return new RegExp(`(^|[^A-Za-z0-9_.])${name}\\s*\\(`);
  }
  // vm.<name> / hevm.<name> — tolerate spaces around the dot, and the hevm alias
  const [, name] = token.split('.');
  return new RegExp(`\\b(?:vm|hevm)\\s*\\.\\s*${name}\\b`);
}
const FORBIDDEN_RES = [...FORBIDDEN_CHEATS.map((c) => ({ cheat: c, re: toRegex(c) })), ...VM_ACCESS_RES];
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

  // Collapse newlines so a call split across lines is still detected.
  const collapsed = clean.replace(/\s+/g, ' ');

  // Record a finding for EVERY line bearing the cheat, not only the first.
  // stripForReferee removes exactly the lines scanCheats pins, so recording a
  // single occurrence would leave a duplicate cheat on a later line in the
  // referee's source — where it would run with the cheat active and could fake
  // a theft. Collecting all occurrences keeps the two rooms honest.
  const collect = (list: { cheat: string; re: RegExp }[]): CheatFinding[] => {
    const out: CheatFinding[] = [];
    for (const { cheat, re } of list) {
      if (!new RegExp(re.source, re.flags).test(collapsed)) continue;
      let pinned = false;
      lines.forEach((l, i) => {
        if (re.test(l)) {
          out.push({ cheat, line: i + 1, text: l.trim() });
          pinned = true;
        }
      });
      // Detected only in the collapsed (cross-line) form: cannot pin to a line.
      // Record it at line 0 so hasForbidden stays true; stripForReferee cannot
      // remove it, and the Foundry referee refuses any run where a cheat remains.
      if (!pinned) out.push({ cheat, line: 0, text: '' });
    }
    return out;
  };

  const forbidden = collect(FORBIDDEN_RES);
  const tolerated = collect(TOLERATED_RES);
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
