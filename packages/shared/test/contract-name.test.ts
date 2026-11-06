import { describe, it, expect } from 'vitest';
import { extractContractName } from '../src/domain/contract-name.js';

describe('extractContractName', () => {
  it('ignores the word "contract" inside a doc comment (the DemoVault bug)', () => {
    const src = `// SPDX-License-Identifier: MIT
/// Demo contract for a live vault that anyone can drain.
pragma solidity ^0.8.20;
contract DemoVault { function withdraw() external {} }`;
    expect(extractContractName(src)).toBe('DemoVault');
  });
  it('ignores a block comment mentioning "contract for"', () => {
    const src = `/* This contract for demo purposes */\ncontract RealVault {}`;
    expect(extractContractName(src)).toBe('RealVault');
  });
  it('prefers a contract over a preceding library or interface', () => {
    const src = `interface IVault { function withdraw() external; }
library SafeMath {}
contract Vault is IVault { function withdraw() external {} }`;
    expect(extractContractName(src)).toBe('Vault');
  });
  it('falls back to a library or interface when there is no contract', () => {
    expect(extractContractName('interface IToken { function transfer() external; }')).toBe('IToken');
  });
  it('handles abstract contracts and returns the fallback when nothing matches', () => {
    expect(extractContractName('abstract contract Base {}')).toBe('Base');
    expect(extractContractName('pragma solidity ^0.8.20;', 'Unknown')).toBe('Unknown');
    expect(extractContractName('', 'the contract')).toBe('the contract');
  });
});

describe('extractContractName with a file-name hint', () => {
  it('prefers the file\'s namesake over a helper declared first', () => {
    const src = `contract Helper {}\ncontract Vault { function withdraw() external {} }`;
    expect(extractContractName(src, 'Unknown', 'src/Vault.sol')).toBe('Vault');
    // without the hint, the first contract wins (documented behavior)
    expect(extractContractName(src)).toBe('Helper');
  });
  it('still returns the first contract when the namesake is absent', () => {
    const src = `contract Alpha {}\ncontract Beta {}`;
    expect(extractContractName(src, 'Unknown', 'Gamma.sol')).toBe('Alpha');
  });
});
