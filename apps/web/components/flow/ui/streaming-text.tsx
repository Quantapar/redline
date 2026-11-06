import { useMemo } from 'react'

const WHITESPACE = /(\s+)/

export function StreamingText({ children, className }: { children: string; className?: string }) {
  const parts = useMemo(() => children.split(WHITESPACE), [children])

  return (
    <span className={className}>
      {parts.map((part, index) =>

        part === '' || WHITESPACE.test(part) ? (
          part
        ) : (

          <span key={index} className="streaming-word">
            {part}
          </span>
        ),
      )}
    </span>
  )
}
