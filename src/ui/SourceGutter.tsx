/**
 * Line numbers beside the raw Markdown source.
 *
 * The source view is a plain textarea, so the numbers cannot be decorations inside it --
 * they have to be a separate column, kept in step with the textarea's scroll.
 *
 * The gutter is driven by the text, not by the rendered view: the number is the line's
 * number in the file, which is what someone reading Markdown source wants to refer to.
 */

import { useEffect, useMemo, useRef } from 'react'

interface SourceGutterProps {
  /** The raw Markdown the textarea is showing. */
  text: string
  /** The textarea, so the gutter can follow its scroll. */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  /** Whether to show the numbers at all. */
  visible: boolean
}

export function SourceGutter({ text, textareaRef, visible }: SourceGutterProps) {
  const gutterRef = useRef<HTMLDivElement>(null)

  const count = useMemo(() => text.split('\n').length, [text])

  // Keep the column aligned with the text as it scrolls, and again whenever the text
  // changes length.
  useEffect(() => {
    const gutter = gutterRef.current
    const textarea = textareaRef.current
    if (!gutter || !textarea) return

    const sync = () => {
      gutter.scrollTop = textarea.scrollTop
    }
    sync()
    textarea.addEventListener('scroll', sync)
    return () => textarea.removeEventListener('scroll', sync)
  }, [textareaRef, count])

  if (!visible) return null

  return (
    <div
      ref={gutterRef}
      aria-hidden="true"
      className="shrink-0 select-none overflow-hidden pt-[3.5rem] text-right"
      style={{ width: '2.5rem', paddingRight: '0.75rem' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="font-mono text-[0.78em] leading-[1.65] text-[var(--text-faint)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {i + 1}
        </div>
      ))}
    </div>
  )
}
