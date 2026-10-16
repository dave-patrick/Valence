export function displayName(path: string | null): string {
  if (!path) return 'this note'
  return path.split('/').pop()?.replace(/\.[^.]+$/, '') || path
}
export { stripExtension } from '@core/wiki'