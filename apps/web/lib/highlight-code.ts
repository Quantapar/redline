import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'
import { parser } from '@lezer/javascript'

export type Run = { text: string; token?: string }

const GRAMMARS = {
  ts: parser.configure({ dialect: 'ts' }),
  tsx: parser.configure({ dialect: 'ts jsx' }),
  js: parser,
  jsx: parser.configure({ dialect: 'jsx' }),

  sh: null,
}

export type CodeLanguage = keyof typeof GRAMMARS

const HIGHLIGHTER = tagHighlighter([
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'comment' },
  {
    tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword, tags.self],
    class: 'keyword',
  },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'string' },
  { tag: [tags.number, tags.bool, tags.null, tags.escape], class: 'number' },
])

export function highlightCode(code: string, language: CodeLanguage): Run[][] {
  const grammar = GRAMMARS[language]
  if (!grammar) return lineUp([{ text: code }])

  const tree = grammar.parse(code)

  const runs: Run[] = []
  let at = 0
  highlightTree(tree, HIGHLIGHTER, (from, to, token) => {
    if (from > at) runs.push({ text: code.slice(at, from) })
    runs.push({ text: code.slice(from, to), token })
    at = to
  })
  if (at < code.length) runs.push({ text: code.slice(at) })

  return lineUp(runs)
}

function lineUp(runs: ReadonlyArray<Run>): Run[][] {
  const lines: Run[][] = [[]]
  for (const run of runs) {
    const pieces = run.text.split('\n')
    for (const [index, piece] of pieces.entries()) {

      if (index > 0) lines.push([])
      if (piece !== '') lines.at(-1)!.push({ text: piece, token: run.token })
    }
  }
  return lines
}
