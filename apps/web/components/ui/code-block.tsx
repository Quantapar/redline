'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { CopyCheck, useReceipt } from '@/components/ui/copy-check'
import {
  Caption,
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipViewport,
} from '@/components/ui/tooltip'
import { changeRuns, numberLines, type DiffLine } from '@/lib/diff-lines'
// Type-only: the highlighter itself (lezer's JS/TS parser, ~150 KB) is loaded on
// demand below, so pages that show code don't ship it in their first-load bundle.
import type { CodeLanguage, Run } from '@/lib/highlight-code'
import { cn } from '@/lib/utils'
import { DownloadIcon, CodeIcon, Terminal } from "lucide-react"

export type { DiffLine }

const plain = (code: string): Run[][] => code.split('\n').map((text) => (text ? [{ text }] : []))

/**
 * Syntax-highlighted lines for `code`. Uses `preset` when the server already
 * highlighted it (no client cost, no flash). Otherwise renders plain text first
 * and swaps in colours once the highlighter chunk loads; 'sh' has no grammar so
 * it never loads the chunk at all.
 */
function useHighlighted(code: string, language: CodeLanguage, preset?: Run[][]): Run[][] {
  const [done, setDone] = useState<{ code: string; language: CodeLanguage; lines: Run[][] } | null>(null)
  useEffect(() => {
    if (preset || language === 'sh') return
    let live = true
    import('@/lib/highlight-code').then(({ highlightCode }) => {
      if (live) setDone({ code, language, lines: highlightCode(code, language) })
    })
    return () => {
      live = false
    }
  }, [code, language, preset])
  if (preset) return preset
  if (done && done.code === code && done.language === language) return done.lines
  return plain(code)
}

export const INK: Record<string, string> = {
  comment: 'text-muted-foreground',
  keyword: 'text-info',
  string: 'text-success',
  number: 'text-warning',
}

const GLYPH = (language: CodeLanguage) => (language === 'sh' ? TerminalGlyph : CodeGlyph)

export type TooltipHandle = ReturnType<typeof createTooltipHandle<string>>

const EXTENSION: Record<CodeLanguage, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  sh: 'sh',
}

function downloadName(filename: string | undefined, language: CodeLanguage) {
  const name = filename?.split('/').at(-1)?.trim()
  if (name && /\.[^.\s]+$/.test(name)) return name
  return `${name || 'code'}.${EXTENSION[language]}`
}

const ROW = {
  context: { tint: '', mark: '', glyph: '' },
  add: { tint: 'bg-success/8', mark: 'text-success', glyph: '+' },
  remove: { tint: 'bg-destructive/8', mark: 'text-destructive', glyph: '-' },
} as const

const BAR = {
  context: '',
  add: 'bg-success',
  remove:
    'bg-[repeating-linear-gradient(45deg,var(--destructive)_0_2px,transparent_2px_4px)] opacity-80',
} as const

const CONTROL =
  'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-ring outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function CodeBlock({
  code: given,
  diff,
  showDiff = true,
  oldStart = 1,
  newStart = 1,
  filename,
  language = 'ts',
  lineNumbers = true,
  className,
  actions,
  copyText,
  download = true,
  highlighted,
}: {

  code?: string

  diff?: readonly DiffLine[]
  showDiff?: boolean

  oldStart?: number
  newStart?: number
  filename?: string
  language?: CodeLanguage
  lineNumbers?: boolean
  className?: string

  actions?: (tip: TooltipHandle) => ReactNode

  copyText?: string

  download?: boolean | string

  /** lines already highlighted on the server (see lib/highlight-code); skips client highlighting */
  highlighted?: Run[][]
}) {
  const code =
    given ??
    (diff ?? [])
      .filter((line) => line.kind !== 'remove')
      .map((line) => line.text)
      .join('\n')
  const diffing = diff !== undefined && showDiff

  const lines = useHighlighted(code.replace(/\n$/, ''), language, diffing ? undefined : highlighted)
  const [copied, showCopied] = useReceipt()

  const [tip] = useState(() => createTooltipHandle<string>())

  const copy = async () => {

    try {
      await navigator.clipboard.writeText(copyText ?? code)
    } catch {
      return
    }
    showCopied()
  }

  const [downloaded, showDownloaded] = useReceipt()
  const save = () => {
    const text = copyText ?? code

    const file = new Blob([text.endsWith('\n') ? text : `${text}\n`], {
      type: 'text/plain;charset=utf-8',
    })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = typeof download === 'string' ? download : downloadName(filename, language)
    link.click()

    window.setTimeout(() => URL.revokeObjectURL(url))
    showDownloaded()
  }

  const Glyph = GLYPH(language)

  return (
    <figure
      data-slot="code-block"
      className={cn('overflow-hidden rounded-xl border bg-card text-card-foreground', className)}
    >

      <figcaption className="flex items-center gap-2 border-b px-3 py-1.5">
        <Glyph size={15} stroke={1.8} aria-hidden className="shrink-0 text-muted-foreground" />

        <span dir="auto" className="truncate font-mono text-xs text-foreground">
          {filename}
        </span>

        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          {diffing ? <DiffCount lines={diff} /> : null}
          {actions?.(tip)}
          {download === false ? null : (
            <TooltipTrigger
              handle={tip}
              payload={downloaded ? 'Downloaded' : 'Download'}
              type="button"
              aria-label={filename ? `Download ${filename}` : 'Download this code'}
              onClick={save}
              closeOnClick={false}
              className={CONTROL}
            >
              <DownloadIcon data-slot="download-icon" size={16} strokeWidth={1.8} aria-hidden />
            </TooltipTrigger>
          )}

          <TooltipTrigger
            handle={tip}
            payload={copied ? 'Copied' : 'Copy'}
            type="button"
            aria-label={filename ? `Copy ${filename}` : 'Copy this code'}
            data-sound="copy"
            onClick={copy}

            closeOnClick={false}
            className={CONTROL}
          >

            <CopyCheck copied={copied} size={16} />
          </TooltipTrigger>
        </div>

        <Tooltip handle={tip}>
          {({ payload }) => (
            <TooltipContent>

              <TooltipViewport>
                <Caption>{payload ?? ''}</Caption>
              </TooltipViewport>
            </TooltipContent>
          )}
        </Tooltip>
      </figcaption>

      {diffing ? (
        <DiffBody lines={diff} language={language} oldStart={oldStart} newStart={newStart} />
      ) : (

        <div dir="ltr" className="flex">

          {lineNumbers ? (
            <div
              aria-hidden
              className="box-content min-w-[2ch] shrink-0 border-r py-2.5 pr-2 pl-2.5 text-right font-code text-[13px] leading-6 text-muted-foreground/70 select-none"
            >
              {lines.map((_, number) => (
                <div key={number}>{number + (diff ? newStart : 1)}</div>
              ))}
            </div>
          ) : null}

          <pre className="min-w-0 flex-1 overflow-x-auto py-2.5 pr-4 pl-2.5 font-code text-[13px] leading-6">

            <code className="block w-max font-code">
              {lines.map((runs, number) => (

                <div key={number}>
                  {runs.map((run, index) => (
                    <span key={index} className={run.token ? INK[run.token] : undefined}>
                      {run.text}
                    </span>
                  ))}

                  {'\n'}
                </div>
              ))}
            </code>
          </pre>
        </div>
      )}
    </figure>
  )
}

function DiffCount({ lines }: { lines: readonly DiffLine[] }) {
  const added = lines.filter((line) => line.kind === 'add').length
  const removed = lines.filter((line) => line.kind === 'remove').length
  return (
    <>
      <span aria-hidden className="me-1.5 flex h-7 items-center gap-1.5 font-mono text-xs">
        <span dir="ltr" className="text-success">
          +{added}
        </span>
        <span dir="ltr" className="text-destructive">
          -{removed}
        </span>
      </span>
      <span className="sr-only">
        {added} added, {removed} removed
      </span>
    </>
  )
}

function DiffBody({
  lines,
  language,
  oldStart,
  newStart,
}: {
  lines: readonly DiffLine[]
  language: CodeLanguage
  oldStart: number
  newStart: number
}) {
  const rows = useMemo(() => numberLines(lines, oldStart, newStart), [lines, oldStart, newStart])
  const runs = useMemo(() => changeRuns(lines), [lines])

  const painted = useHighlighted(
    useMemo(() => lines.map((line) => line.text).join('\n'), [lines]),
    language,
  )

  return (

    <div dir="ltr" className="flex [--diff-line:1.5rem]">

      <div aria-hidden className="w-1.5 shrink-0 py-2">
        {runs.map(({ kind, count }, index) => (
          <div
            key={index}
            style={{ height: `calc(${count} * var(--diff-line))` }}
            className={cn('bg-clip-content py-px pl-0.5', BAR[kind])}
          />
        ))}
      </div>

      <div
        aria-hidden
        className="shrink-0 py-2 font-code text-[13px] leading-6 text-muted-foreground/70 select-none"
      >
        {rows.map((row, index) => (
          <div key={index} className={cn('flex', ROW[row.kind].tint)}>
            <span className="flex gap-2 border-r pr-2 pl-2.5">
              <span className="min-w-[2ch] text-right">{row.old}</span>
              <span className="min-w-[2ch] text-right">{row.new}</span>
            </span>
            <span className={cn('min-w-[1ch] px-2.5', ROW[row.kind].mark)}>
              {ROW[row.kind].glyph}
            </span>
          </div>
        ))}
      </div>

      <pre className="min-w-0 flex-1 overflow-x-auto py-2 font-code text-[13px] leading-6">

        <code className="block w-max min-w-full font-code">
          {rows.map((row, index) => (
            <div
              key={index}
              className={cn(
                'pr-4 pl-0.5',
                ROW[row.kind].tint,
                row.kind === 'context' && 'text-muted-foreground',
              )}
            >

              {row.kind === 'context' ? null : (
                <span className="sr-only select-none">
                  {row.kind === 'add' ? 'Added: ' : 'Removed: '}
                </span>
              )}
              {painted[index]?.map((run, at) => (
                <span
                  key={at}
                  className={run.token && row.kind !== 'context' ? INK[run.token] : undefined}
                >
                  {run.text}
                </span>
              ))}
              {'\n'}
            </div>
          ))}
        </code>
      </pre>
    </div>
  )
}

type PlaceholderGlyphProps = Omit<
  import('react').ComponentPropsWithoutRef<'svg'>,
  'stroke' | 'strokeWidth' | 'children'
> & {
  stroke?: number
  size?: number
}

function CodeGlyph({ stroke = 2, ...props }: PlaceholderGlyphProps) {
  return <CodeIcon strokeWidth={stroke} {...props} />
}

function TerminalGlyph({ stroke = 2, ...props }: PlaceholderGlyphProps) {
  return <Terminal strokeWidth={stroke} {...props} />
}