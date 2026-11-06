import { describe, it, expect } from 'vitest';
import { scanCheats, FORBIDDEN_CHEATS } from '../src/cheatcodes.js';

// Property-based: for each forbidden cheat, a hunter may obfuscate the call many ways.
// Every variation must still be detected — the two-room boundary depends on it.
function variationsFor(token: string): string[] {
  const out: string[] = [];
  if (token.endsWith('(')) {
    const name = token.slice(0, -1); // bare helper e.g. deal(
    out.push(`${name}(a, 1);`, `  ${name}  (a, 1);`, `x();\n${name}(a);`, `\t${name}\t(a);`, `foo(); ${name}(a);`);
  } else {
    const [, method] = token.split('.'); // vm.<method>
    for (const handle of ['vm', 'hevm']) {
      out.push(
        `${handle}.${method}(a);`,
        `${handle} . ${method}(a);`,
        `${handle}.${method} (a);`,
        `${handle}/* x */.${method}(a);`,
        `${handle}\n  .${method}(a);`,
        `  ${handle}.${method}(a);  // comment`,
      );
    }
  }
  return out;
}

describe('cheatcode scanner — property/fuzz over obfuscations', () => {
  it('detects every forbidden cheat under whitespace/comment/newline/handle variations', () => {
    const misses: string[] = [];
    for (const token of FORBIDDEN_CHEATS) {
      for (const v of variationsFor(token)) {
        if (!scanCheats(v).hasForbidden) misses.push(`${token} -> ${JSON.stringify(v)}`);
      }
    }
    expect(misses).toEqual([]);
  });

  it('detects Vm-interface and precompile-address access in many forms', () => {
    const addr = '0x7109709ECfa91a80626fF3989D68f67F5b1DD12D';
    const forms = [
      `Vm v = Vm(${addr}); v.deal(a,1);`,
      `Vm constant V = Vm(VM_ADDR);`,
      `Vm _vm = vm; _vm.store(a,b,c);`,
      `IVm w = IVm(${addr});`,
      `Hevm h = Hevm(${addr});`,
      `address p = ${addr.toLowerCase()}; p.call(data);`,
      `assembly { let r := call(gas(), ${addr}, 0, i, n, 0, 0) }`,
    ];
    const misses = forms.filter((f) => !scanCheats(f).hasForbidden);
    expect(misses).toEqual([]);
  });

  it('does NOT flag innocent code that merely resembles a cheat', () => {
    const innocent = [
      'uint dealSize = 1; token.transfer(to, dealSize);',
      'function deploy() public { factory.create(); }',       // not deployCode
      'myVm.run();',                                           // not the vm handle (myVm != vm, no .deal etc.)
      'contract VaultManager { }',                            // "Vm" only as a substring of a word
      'realStartHoax();',                                     // not the startHoax( helper
    ];
    const falsePositives = innocent.filter((f) => scanCheats(f).hasForbidden);
    expect(falsePositives).toEqual([]);
  });
});
