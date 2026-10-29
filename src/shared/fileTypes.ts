/** File discovery and pickers share one list; only Markdown uses the rich editor. */
export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mdx']
export const DOCUMENT_EXTENSIONS = [
  ...MARKDOWN_EXTENSIONS,
  'txt', 'yaml', 'yml', 'log', 'json', 'jsonl', 'toml', 'ini', 'cfg', 'conf', 'xml', 'csv', 'tsv',
]

function extension(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? ''
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
}

export function isDocument(path: string): boolean {
  return DOCUMENT_EXTENSIONS.includes(extension(path))
}

export function isMarkdownDocument(path: string | null): boolean {
  return path === null || MARKDOWN_EXTENSIONS.includes(extension(path))
}

/** Textareas normalize line endings to LF; retain the file's original CRLF convention. */
export function preserveLineEndings(text: string, original: string): string {
  return original.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text
}
