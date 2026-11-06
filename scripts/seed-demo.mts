// Seed the redline DB by running real scans through the pipeline (simulated engine).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

// This script writes SIMULATED findings (deterministic engine, not a measured
// referee) and WIPES existing rows. It must be opted into explicitly so it can
// never run against a real database by accident.
if (process.env.REDLINE_DEMO !== '1') {
  console.error('seed-demo refuses to run without REDLINE_DEMO=1 (it wipes rows and writes simulated findings).');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('seed-demo needs DATABASE_URL set (no hardcoded fallback).');
  process.exit(1);
}

const { createDb, schema, createScan } = await import('../packages/db/src/index.ts');
const { SimulationRefereeEngine } = await import('../packages/engine/src/index.ts');
const { FakeRouterClient } = await import('../packages/hunters/src/index.ts');
const { DEFAULT_POLICY } = await import('../packages/shared/src/index.ts');
const { runScan } = await import('../packages/worker/src/index.ts');

const { db, close } = createDb(process.env.DATABASE_URL);

// clean existing demo rows
for (const t of [schema.refereeRuns, schema.regressionTests, schema.fixes, schema.findings, schema.candidates, schema.scans, schema.repositories, schema.installations, schema.accounts]) {
  await db.delete(t);
}

const [account] = await db.insert(schema.accounts).values({ githubLogin: 'acme-defi', githubId: 4242, planTier: 'pro' }).returning();
const [inst] = await db.insert(schema.installations).values({ accountId: account!.id, githubInstallationId: 90210 }).returning();
const repos = await db.insert(schema.repositories).values([
  { installationId: inst!.id, githubRepoId: 1, fullName: 'acme-defi/vault-core', defaultBranch: 'main' },
  { installationId: inst!.id, githubRepoId: 2, fullName: 'acme-defi/staking-rewards', defaultBranch: 'main' },
  { installationId: inst!.id, githubRepoId: 3, fullName: 'acme-defi/governance', defaultBranch: 'main' },
]).returning();

const VAULT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract EtherVault {
    mapping(address => uint256) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0);
        (bool ok,) = msg.sender.call{value: bal}("");
        require(ok);
        balances[msg.sender] = 0; // state update AFTER external call -> reentrancy
    }
}`;
const TOKEN = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract RewardToken {
    mapping(address=>uint256) public balanceOf;
    address public owner;
    function mint(address to, uint256 amt) external { balanceOf[to] += amt; } // missing onlyOwner
}`;
const GOV = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Governance {
    mapping(uint=>uint) public votes;
    function vote(uint id) external { votes[id] += 1; } // benign
}`;

function clientFor(spec: Record<string, { wc: string; fn: string; summary: string; directive: string; shortcuts?: boolean }>) {
  return new FakeRouterClient((req) => {
    const text = req.messages.map((m) => m.content).join('\n');
    for (const [name, c] of Object.entries(spec)) {
      if (text.includes(name)) {
        return JSON.stringify({ candidates: [{
          weaknessClass: c.wc, targetFunction: c.fn, summary: c.summary,
          forgeTest: `// ${c.directive}\nfunction testExploit() public {${c.shortcuts ? ' vm.deal(attacker,100 ether);' : ''} target.${c.fn}(); }`,
          claimedValueWei: '8500000000000000000', usedShortcuts: Boolean(c.shortcuts),
        }] });
      }
    }
    return JSON.stringify({ candidates: [] });
  });
}

const engine = new SimulationRefereeEngine();

async function scanRepo(repoId: string, sha: string, source: string, name: string, spec: any) {
  const scan = await createScan(db, { repositoryId: repoId, trigger: 'push', commitSha: sha, budgetCapCents: 500 });
  const target = { contractName: name, filePath: `src/${name}.sol`, source, changedFunctions: [], analyzerNotes: [] };
  const res = await runScan({ db, client: clientFor(spec), engine, prepare: async () => ({ targets: [target], policy: DEFAULT_POLICY }) }, scan.id);
  console.log(`${name}: candidates=${res.candidateCount} red=${res.redCount}`);
}

await scanRepo(repos[0]!.id, 'a1b2c3d', VAULT, 'EtherVault', {
  EtherVault: { wc: 'reentrancy', fn: 'withdraw', summary: 'Reentrancy in withdraw() lets a malicious receiver re-enter before the balance is zeroed and drain the vault.', directive: '@redline-sim exploitable=true netWei=8500000000000000000 cheatDependent=false flaky=false' },
});
await scanRepo(repos[1]!.id, 'e4f5a6b', TOKEN, 'RewardToken', {
  RewardToken: { wc: 'access-control', fn: 'mint', summary: 'mint() has no owner check, so anyone can mint unlimited reward tokens to themselves.', directive: '@redline-sim exploitable=true netWei=100000000000000000000 cheatDependent=false flaky=false' },
});
await scanRepo(repos[2]!.id, 'c7d8e9f', GOV, 'Governance', {
  Governance: { wc: 'logic-error', fn: 'vote', summary: 'candidate', directive: '@redline-sim exploitable=false netWei=0 cheatDependent=false flaky=false' },
});

// --- seed the shared attack-recipe library ---
await db.delete(schema.recipes);
await db.insert(schema.recipes).values([
  { weaknessClass: 'reentrancy', chain: 'ethereum', severity: 'critical', labels: ['external-call', 'state-after'], title: 'Single-function reentrancy', template: 'Call the withdrawing function from a receive() that re-enters before the balance is zeroed.', source: 'seed' },
  { weaknessClass: 'access-control', chain: 'ethereum', severity: 'critical', labels: ['missing-modifier'], title: 'Unguarded privileged function', template: 'Call a mint/withdraw/upgrade function that lacks an owner/role check from a non-owner account.', source: 'seed' },
  { weaknessClass: 'price-oracle-manipulation', chain: 'ethereum', severity: 'critical', labels: ['spot-price', 'amm'], title: 'Spot-price oracle manipulation', template: 'Move an AMM pool price within one transaction, then call the victim that reads spot price.', source: 'seed' },
  { weaknessClass: 'flash-loan', chain: 'ethereum', severity: 'high', labels: ['flash-loan'], title: 'Flash-loan funded attack', template: 'Borrow a large amount via flash loan, manipulate state, extract value, repay in the same tx.', source: 'seed' },
  { weaknessClass: 'unchecked-external-call', chain: 'ethereum', severity: 'high', labels: ['return-value'], title: 'Unchecked call return', template: 'Trigger a low-level call whose failure is ignored, leaving the contract in an inconsistent state.', source: 'seed' },
  { weaknessClass: 'signature-replay', chain: 'ethereum', severity: 'high', labels: ['nonce', 'permit'], title: 'Signature replay', template: 'Replay a signed message that lacks a nonce or chainId binding on a second call.', source: 'watch-mode' },
]);
console.log('seeded 6 attack recipes');

const findings = await db.select().from(schema.findings);
console.log(`\nseeded: ${repos.length} repos, ${findings.length} findings, ${findings.filter((f)=>f.isRed).length} red`);
await close();
