import { getDomainPatterns, normalizeWebsiteScope, updateWebsiteScope } from './pattern.ts'
import type { TemplateWebsiteScope } from './pattern.ts'
import { isBlank } from './schema-fields.ts'
import { templatesEqual } from './templates.ts'
import type { TemplateText } from './templates.ts'

export type WebsiteDomainDraft = { text: TemplateText; editing: number | null }

export function commitWebsiteDomainDrafts(value: TemplateWebsiteScope, creation: TemplateText, manager: WebsiteDomainDraft):
  | { ok: true; value: TemplateWebsiteScope }
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

export function removeWebsiteDomain(value: TemplateWebsiteScope, index: number, draft: WebsiteDomainDraft) {
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
    pending: editing === null ? !isBlank(text) : !templatesEqual(text, remaining[editing]),
  }
}
