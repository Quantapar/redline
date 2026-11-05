// Live smoke test: hit the real 0G router with the hunter prompt on our own
// deliberately-vulnerable fixture contract, and parse the result.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// load .env
const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const { OGRouterClient } = await import('../packages/hunters/src/router-client.ts');
const { buildHuntMessages } = await import('../packages/hunters/src/prompts.ts');
const { parseCandidates } = await import('../packages/hunters/src/hunter.ts');
const { WeaknessClass, DEFAULT_POLICY } = await import('../packages/shared/src/index.ts');

const VULN = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract EtherVault {
    mapping(address => uint256) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "no balance");
        (bool ok, ) = msg.sender.call{value: bal}("");   // external call before state update
        require(ok, "send failed");
        balances[msg.sender] = 0;                         // state updated after -> reentrancy
    }
}`;

const client = new OGRouterClient();
const target = {
  contractName: 'EtherVault', filePath: 'src/EtherVault.sol', source: VULN,
  changedFunctions: ['withdraw'], analyzerNotes: ['reentrancy-eth: external call precedes state update in withdraw()'],
};
const model = 'qwen3-coder-flash';
console.log(`calling ${model} via 0G router...`);
const t0 = Date.now();
const resp = await client.chat({ model, messages: buildHuntMessages(target, WeaknessClass.options, DEFAULT_POLICY), jsonMode: true });
console.log(`model=${resp.model} receipt=${resp.receipt} tokens=${resp.usage?.totalTokens} in ${((Date.now()-t0)/1000).toFixed(1)}s`);
const cands = parseCandidates(resp, 'smoke-scan', 'EtherVault');
console.log(`candidates parsed: ${cands.length}`);
for (const c of cands) {
  console.log(`- [${c.weaknessClass}] ${c.summary}`);
  console.log(`  forgeTest length: ${c.forgeTest.length} chars, usedShortcuts=${c.usedShortcuts}, claimedWei=${c.claimedValueWei}`);
}
if (cands.length === 0) console.log('RAW (first 600):', resp.content.slice(0, 600));
