import * as z from 'zod/mini'
import { getDomainPatterns, isValidDomainPattern } from './pattern.ts'
import { displayText, hasTokens, isBlankTemplate, isTemplateObject, normalizeStoredTemplate, TemplateTextSchema } from './templates.ts'
import type { WebsiteScope } from './pattern.ts'

/** Header names and values may hold variable references. */
export const HeaderPairSchema = z.object({ key: TemplateTextSchema, value: TemplateTextSchema })
/** Concrete text, after variables are filled in or for recorded executions. */
export const PlainHeaderPairSchema = z.object({ key: z.string(), value: z.string() })
export const RuleIdSchema = z.pipe(z.uuid(), z.transform(value => value.toLowerCase()))
export const WebsiteScopeSchema = z.union([TemplateTextSchema, z.array(TemplateTextSchema)])
export const PlainWebsiteScopeSchema = z.union([z.string(), z.array(z.string())])
// Malformed lists must never fall back to the all-websites wildcard.
export const PersistedWebsiteScopeSchema = z.pipe(z.unknown(), z.transform((input): WebsiteScope => {
  if (Array.isArray(input)) return input.every(item => typeof item === 'string' || isTemplateObject(item)) ? input.map(item => normalizeStoredTemplate(item)) : []
  return typeof input === 'string' || isTemplateObject(input) ? normalizeStoredTemplate(input) : '*'
}))
export const EntryShape = {
  id: RuleIdSchema, name: z.string(), url: WebsiteScopeSchema, enabled: z.boolean(), order: z.number(),
}
// A domain holding a variable is checked once its value is filled in.
export const WebsiteSchema = WebsiteScopeSchema.check(z.refine(scope => {
  const patterns = getDomainPatterns(scope)
  return patterns.length > 0 && patterns.every(pattern => hasTokens(pattern) || isValidDomainPattern(displayText(pattern)))
}, {
  message: 'Add a website domain like localhost:4200, *.example.com, or *.',
}))
export const requiredName = (label: string) => z.string().check(z.refine(value => Boolean(value.trim()), {
  message: `${label} is required.`,
}))
export const isBlank = isBlankTemplate
