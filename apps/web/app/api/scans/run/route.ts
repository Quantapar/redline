import { NextResponse } from 'next/server';
import { eq, schema, createScan } from '@redline/db';
import { SimulationRefereeEngine, type RefereeInput } from '@redline/engine';
import { FakeRouterClient, type ChatRequest, type RouterClient } from '@redline/hunters';
import { DEFAULT_POLICY } from '@redline/shared';
import { runScan } from '@redline/worker';
import { db } from '@/lib/db';
import { publisher, publishEvent } from '@/lib/scan-events';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// A paced fake model so the live room is watchable.
class PacedClient implements RouterClient {
  private fake = new FakeRouterClient(() =>
    JSON.stringify({
      candidates: [{
        weaknessClass: 'reentrancy', targetFunction: 'withdraw',
        summary: 'Reentrancy in withdraw() lets a malicious receiver re-enter before the balance is zeroed and drain the vault.',
        forgeTest: '// @redline-sim exploitable=true netWei=8500000000000000000 cheatDependent=false flaky=false\nfunction testExploit() public { target.withdraw(); }',
        claimedValueWei: '8500000000000000000', usedShortcuts: false,
      }],
    }),
  );
  async chat(req: ChatRequest) {
    await sleep(900);
    return this.fake.chat(req);
  }
}

class PacedEngine extends SimulationRefereeEngine {
  override async run(input: RefereeInput) {
    await sleep(750);
    return super.run(input);
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(`scan:${clientKey(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const d = db();

  let repoId: string | undefined = body.repoId;
  if (!repoId) {
    const [repo] = await d.select().from(schema.repositories).where(eq(schema.repositories.fullName, 'acme-defi/vault-core')).limit(1);
    repoId = repo?.id ?? (await d.select().from(schema.repositories).limit(1))[0]?.id;
  }
  if (!repoId) return NextResponse.json({ error: 'no repository to scan' }, { status: 404 });

  const scan = await createScan(d, {
    repositoryId: repoId, trigger: 'manual', commitSha: Math.random().toString(16).slice(2, 9), budgetCapCents: 500,
  });

  // Fire-and-forget: run the scan, publishing live events to Redis.
  const pub = publisher();
  const target = { contractName: 'EtherVault', filePath: 'src/EtherVault.sol', source: VAULT, changedFunctions: ['withdraw'], analyzerNotes: ['reentrancy-eth: external call precedes state update in withdraw()'] };
  void (async () => {
    try {
      await sleep(1500); // let the client connect to the live stream first
      await runScan(
        {
          db: d,
          client: new PacedClient(),
          engine: new PacedEngine(),
          prepare: async () => { await sleep(900); return { targets: [target], policy: DEFAULT_POLICY }; },
          emit: (ev) => publishEvent(pub, ev),
        },
        scan.id,
      );
    } catch (err) {
      publishEvent(pub, { type: 'log', scanId: scan.id, message: `scan error: ${String(err).slice(0, 160)}`, at: new Date().toISOString() });
    } finally {
      await sleep(500);
      void pub.quit();
    }
  })();

  return NextResponse.json({ scanId: scan.id });
}
