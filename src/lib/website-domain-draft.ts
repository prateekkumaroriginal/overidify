import { getDomainPatterns, normalizeWebsiteScope, updateWebsiteScope } from './pattern.ts'
import type { WebsiteScope } from './pattern.ts'

export type WebsiteDomainDraft = { text: string; editing: number | null }

export function commitWebsiteDomainDrafts(value: WebsiteScope, creation: string, manager: WebsiteDomainDraft):
  | { ok: true; value: WebsiteScope }
  | { ok: false; field: 'creation' | 'manager'; message: string } {
  let field: 'creation' | 'manager' = 'manager'
  try {
    const edited = updateWebsiteScope(value, manager.text, manager.editing)
    field = 'creation'
    return { ok: true, value: updateWebsiteScope(edited, creation, null) }
  } catch (error) {
    return { ok: false, field, message: error instanceof Error ? error.message : 'Enter a valid website domain.' }
  }
}

export function removeWebsiteDomain(value: WebsiteScope, index: number, draft: WebsiteDomainDraft) {
  const remaining = getDomainPatterns(value).filter((_, position) => position !== index)
  let { text, editing } = draft
  if (editing === index) {
    editing = null
    text = ''
  } else if (editing !== null && index < editing) {
    editing--
  }
  return {
    value: normalizeWebsiteScope(remaining), text, editing,
    pending: editing === null ? !!text.trim() : text !== remaining[editing],
  }
}
