import { describe, it, expect } from 'vitest';
import { scanCheats, stripForReferee, FORBIDDEN_CHEATS } from '../src/cheatcodes.js';

const attack = `
function testExploit() public {
  vm.deal(attacker, 100 ether);     // free money
  vm.startPrank(victimOwner);       // impersonate
  target.withdraw(100 ether);
  vm.stopPrank();
  vm.warp(block.timestamp + 1 days);// tolerated
}`;

describe('cheatcode scanner', () => {
  it('flags forbidden cheats that fabricate advantage', () => {
    const s = scanCheats(attack);
    expect(s.hasForbidden).toBe(true);
    const names = s.forbidden.map((f) => f.cheat);
    expect(names).toContain('vm.deal');
    expect(names).toContain('vm.startPrank');
  });
  it('treats time/block cheats as tolerated', () => {
    const s = scanCheats(attack);
    expect(s.tolerated.map((f) => f.cheat)).toContain('vm.warp');
  });
  it('ignores cheats that appear only in comments', () => {
    const s = scanCheats('// vm.deal(attacker, 1 ether) is not called here');
    expect(s.hasForbidden).toBe(false);
  });
  it('strips forbidden cheat lines for the referee room', () => {
    const { cleaned, removed } = stripForReferee(attack);
    expect(removed.length).toBeGreaterThan(0);
    for (const c of ['vm.deal', 'vm.startPrank', 'vm.stopPrank']) {
      expect(cleaned).not.toContain(c);
    }
    expect(cleaned).toContain('vm.warp'); // tolerated survives
  });
  it('covers every forbidden cheat name', () => {
    for (const c of FORBIDDEN_CHEATS) {
      const call = c.endsWith('(') ? `${c}attacker, 1 ether);` : `${c}(attacker, 1 ether);`;
      expect(scanCheats(`  ${call}`).hasForbidden).toBe(true);
    }
  });

  it('catches cheats obfuscated with whitespace or block comments', () => {
    expect(scanCheats('vm . deal(attacker, 1 ether);').hasForbidden).toBe(true);
    expect(scanCheats('vm./* sneaky */deal(attacker, 1 ether);').hasForbidden).toBe(true);
    expect(scanCheats('vm\n  .deal(attacker, 1);').hasForbidden).toBe(true);
  });

  it('does not flag a different identifier that merely starts the same', () => {
    expect(scanCheats('uint dealmaker = 1; realTransfer();').hasForbidden).toBe(false);
  });

  it('strips EVERY occurrence of a repeated cheat, not just the first', () => {
    // A hunter could evade a strip-the-first-line scanner by repeating the cheat.
    const repeated = `
function testExploit() public {
  vm.deal(attacker, 100 ether);
  target.poke();
  vm.deal(attacker, 900 ether);
  target.withdraw(1000 ether);
}`;
    const s = scanCheats(repeated);
    expect(s.forbidden.filter((f) => f.cheat === 'vm.deal').length).toBe(2);
    const { cleaned } = stripForReferee(repeated);
    expect(cleaned).not.toContain('vm.deal'); // both lines gone
  });

  it('catches cheat access through an aliased Vm handle (not the literal `vm`)', () => {
    // From the security review: alias the Vm interface and the `vm.*` matcher is blind.
    expect(scanCheats('Vm V = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);\nV.deal(a, 1 ether);').hasForbidden).toBe(true);
    expect(scanCheats('Vm _vm = vm;\n_vm.startPrank(owner);').hasForbidden).toBe(true);
    expect(scanCheats('Vm constant V = Vm(VM_ADDRESS);').hasForbidden).toBe(true);
  });

  it('catches a raw call to the cheatcode precompile address with no cheat name', () => {
    const raw = 'address vmp = 0x7109709ECfa91a80626fF3989D68f67F5b1DD12D;\nvmp.call(abi.encodeWithSelector(bytes4(0xc88a5e6d), attacker, uint256(1000 ether)));';
    expect(scanCheats(raw).hasForbidden).toBe(true);
    // lowercase / checksummed forms both match (case-insensitive).
    expect(scanCheats('call(gas(), 0x7109709ecfa91a80626ff3989d68f67f5b1dd12d, 0, p, n, 0, 0)').hasForbidden).toBe(true);
  });

  it('catches the hevm handle alias and missing forge-std helpers', () => {
    expect(scanCheats('hevm.deal(attacker, 1 ether);').hasForbidden).toBe(true);
    expect(scanCheats('changePrank(victimOwner); target.withdraw();').hasForbidden).toBe(true);
    expect(scanCheats('deployCode("Evil.sol", abi.encode(x));').hasForbidden).toBe(true);
  });

  it('a cross-line cheat that cannot be pinned survives stripping but stays flagged', () => {
    // vm\n.deal(...) is valid Solidity; it is detected across lines (line 0) and
    // cannot be removed by line. The referee must still see it as cheat-bearing.
    const split = 'function t() public {\n  vm\n  .deal(attacker, 1 ether);\n}';
    expect(scanCheats(split).hasForbidden).toBe(true);
    const { cleaned } = stripForReferee(split);
    // It could not be stripped, so a re-scan of the cleaned source still flags it.
    // The Foundry referee relies on exactly this to refuse the run.
    expect(scanCheats(cleaned).hasForbidden).toBe(true);
  });
});
