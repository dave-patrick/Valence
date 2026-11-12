import { isMap, parseDocument } from 'yaml'
import { isMarkdownDocument } from '../shared/fileTypes'

export interface QuantosMoveRequest {
  root: string
  workspace: string
  title: string
  source: string
  path: string | null
  saved: string
}

export interface QuantosMoveResult {
  path: string
  content: string
  recoveryPath?: string
}

export function prepareQuantosDocument(request: Pick<QuantosMoveRequest, 'title' | 'source' | 'path'>): { stem: string; content: string } {
  let stem = request.title.replace(/\.(md|markdown|mdown|mkd|mdx)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/^\.+/, '').trim().replace(/[. ]+$/, '').slice(0, 100).replace(/[. ]+$/, '') || 'Untitled'
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`.slice(0, 100)
  let content = request.source
  if (isMarkdownDocument(request.path)) {
    const opening = /^(?:\uFEFF)?---\r?\n/.exec(content)
    if (opening) {
      const tail = content.slice(opening[0].length)
      const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(tail)
      if (!closing) throw new Error('Markdown front matter has no closing --- delimiter.')
      const yaml = tail.slice(0, closing.index)
      const document = parseDocument(yaml)
      if (document.errors.length || !isMap(document.contents)) throw new Error('Markdown front matter must be a valid YAML mapping.')
      if (request.path === null && document.has('id')) {
        document.delete('id')
        const eol = opening[0].includes('\r\n') ? '\r\n' : '\n'
        const updated = document.toString().replace(/\r?\n/g, eol)
        content = opening[0] + updated + tail.slice(closing.index)
      }
    }
  } else {
    const runs = content.match(/`+/g) ?? []
    const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)))
    const extension = request.path?.split('.').pop() ?? ''
    const language = /^[a-zA-Z0-9_+-]+$/.test(extension) ? extension.toLowerCase() : ''
    const heading = request.title.replace(/[\r\n]+/g, ' ')
    content = `# ${heading}\n\n${fence}${language}\n${content}${content.endsWith('\n') ? '' : '\n'}${fence}\n`
  }
  return { stem, content }
}
