export type DiffLine = { kind: 'context' | 'add' | 'remove'; text: string }

export type NumberedLine = DiffLine & { old: number | null; new: number | null }

export function numberLines(
  lines: readonly DiffLine[],
  oldStart = 1,
  newStart = 1,
): NumberedLine[] {
  let old = oldStart
  let next = newStart
  return lines.map((line) => ({
    ...line,
    old: line.kind === 'add' ? null : old++,
    new: line.kind === 'remove' ? null : next++,
  }))
}

export function changeRuns(
  lines: readonly DiffLine[],
): { kind: DiffLine['kind']; count: number }[] {
  const runs: { kind: DiffLine['kind']; count: number }[] = []
  for (const { kind } of lines) {
    const last = runs.at(-1)
    if (last?.kind === kind) last.count += 1
    else runs.push({ kind, count: 1 })
  }
  return runs
}
