import { getDomainPatterns, normalizeWebsiteScope } from './pattern.ts'
import type { WebsiteScope } from './pattern.ts'

export function removeWebsiteDomain(value: WebsiteScope, index: number, draft: { text: string; editing: number | null }) {
  const remaining = getDomainPatterns(value).filter((_, position) => position !== index)
  let { text, editing } = draft
  const listMode = remaining.length > 1 || (remaining.length === 1 && editing === null && !!text)
  if (remaining.length === 1 && (editing === index || (editing === null && !text))) {
    editing = 0
    text = remaining[0]
  } else if (editing === index) {
    editing = null
    text = ''
  } else if (editing !== null && index < editing) {
    editing--
  }
  return {
    value: normalizeWebsiteScope(remaining), text, editing, listMode,
    pending: editing === null ? !!text.trim() : text !== remaining[editing],
  }
}
