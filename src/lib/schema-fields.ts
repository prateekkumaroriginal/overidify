import * as z from 'zod/mini'
import { getDomainPatterns, isValidDomainPattern } from './pattern.ts'
import { displayText, hasReferences, isTemplateEmpty, normalizePersistedTemplate, TemplateTextSchema, trimTemplateEdges } from './templates.ts'
import type { TemplateText } from './templates.ts'

export const HeaderPairSchema = z.object({ key: TemplateTextSchema, value: TemplateTextSchema })
export const RuleIdSchema = z.pipe(z.uuid(), z.transform(value => value.toLowerCase()))
export const WebsiteScopeSchema = z.union([TemplateTextSchema, z.array(TemplateTextSchema)])
export const PersistedTemplateSchema = z.pipe(z.unknown(), z.transform(value => normalizePersistedTemplate(value)))
const isTemplateInput = (value: unknown) => typeof value === 'string' || (!!value && typeof value === 'object' && Array.isArray((value as { template?: unknown }).template))
// Malformed lists must never fall back to the all-websites wildcard.
export const PersistedWebsiteScopeSchema = z.pipe(z.unknown(), z.transform((value): TemplateText | TemplateText[] => {
  if (Array.isArray(value)) return value.every(isTemplateInput) ? value.map(domain => normalizePersistedTemplate(domain)) : []
  return isTemplateInput(value) ? normalizePersistedTemplate(value) : '*'
}))
export const EntryShape = {
  id: RuleIdSchema, name: TemplateTextSchema, url: WebsiteScopeSchema, enabled: z.boolean(), order: z.number(),
}
/** Save-blocking checks never depend on variable values: a domain with a reference is accepted. */
export function isSaveableDomain(domain: TemplateText) {
  return hasReferences(domain) ? !isTemplateEmpty(trimTemplateEdges(domain)) : isValidDomainPattern(displayText(domain))
}
export const WebsiteSchema = WebsiteScopeSchema.check(z.refine(scope => {
  const patterns = getDomainPatterns(scope)
  return patterns.length > 0 && patterns.every(isSaveableDomain)
}, {
  message: 'Add a website domain like localhost:4200, *.example.com, or *.',
}))
export const isBlank = (value: TemplateText) => isTemplateEmpty(trimTemplateEdges(value))
export const requiredName = (label: string) => TemplateTextSchema.check(z.refine(value => !isBlank(value), {
  message: `${label} is required.`,
}))
const PersistedTemplateFieldSchema = z.pipe(z.custom<TemplateText>(isTemplateInput), z.transform(value => normalizePersistedTemplate(value)))
export const PersistedHeaderPairSchema = z.object({ key: PersistedTemplateFieldSchema, value: PersistedTemplateFieldSchema })
