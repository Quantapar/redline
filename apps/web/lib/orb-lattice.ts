export const CYCLE = { S2: 1600, S3: 1700 } as const

export type OrbVariant = keyof typeof CYCLE

export const RING = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
] as const

export type OrbCell = {
  x: number
  y: number
  delay: number
  still: boolean
  mid: boolean
}

export function schedule(variant: OrbVariant): Array<OrbCell> {
  return [0, 1, 2].flatMap((y) =>
    [0, 1, 2].map((x) => {
      const index = RING.findIndex(([rx, ry]) => rx === x && ry === y)
      const mid = x === 1 && y === 1
      const delay =
        variant === 'S2'
          ? ((x + y) / 4) * 1500
          : -(((RING.length - index) % RING.length) / RING.length) * CYCLE.S3

      return {
        x,
        y,
        delay: index < 0 && variant === 'S3' ? 0 : delay,
        still: variant === 'S3' && mid,
        mid,
      }
    }),
  )
}
