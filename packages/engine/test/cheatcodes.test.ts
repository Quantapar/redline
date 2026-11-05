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
      expect(scanCheats(`x = ${c}something;`).hasForbidden).toBe(true);
    }
  });
});
