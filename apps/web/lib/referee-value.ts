export function netMovedWei(deltas: unknown): string {
  try {
    const arr = (deltas as { token: string; attackerNetOfGas: string }[]) ?? [];
    let total = 0n;
    for (const d of arr) if (d.token === 'native') total += BigInt(d.attackerNetOfGas);
    return total.toString();
  } catch {
    return '0';
  }
}
