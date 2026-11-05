/**
 * The runnable exploit is a misuse risk: it must not reach a viewer who has not
 * proven they control the live contract. We redact server-side so the full attack
 * never leaves the server. Only a harmless silhouette (shape, not steps) is sent.
 */
export function redactAttack(forgeTest: string): { preview: string; hiddenLines: number } {
  const lines = forgeTest.split('\n');
  const sig = lines.find((l) => /function\s+\w+/.test(l))?.trim() ?? 'function testExploit() public {';
  const hiddenLines = Math.max(1, lines.filter((l) => l.trim().length > 0).length - 1);
  const preview = [
    '// Runnable exploit withheld.',
    '// Prove you control the live contract to reveal the steps.',
    sig.replace(/\{.*$/, '{'),
    '    ' + '█'.repeat(28),
    '    ' + '█'.repeat(22),
    '    ' + '█'.repeat(31),
    '}',
  ].join('\n');
  return { preview, hiddenLines };
}
