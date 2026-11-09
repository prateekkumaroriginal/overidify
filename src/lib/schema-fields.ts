import * as z from 'zod/mini'
import { getDomainPatterns, isValidDomainPattern } from './pattern.ts'

export const HeaderPairSchema = z.object({ key: z.string(), value: z.string() })
export const RuleIdSchema = z.pipe(z.uuid(), z.transform(value => value.toLowerCase()))
export const WebsiteScopeSchema = z.union([z.string(), z.array(z.string())])
// Malformed lists must never fall back to the all-websites wildcard.
export const PersistedWebsiteScopeSchema = z.catch(WebsiteScopeSchema, context => Array.isArray(context.input) ? [] : '*')
export const EntryShape = {
  id: RuleIdSchema, name: z.string(), url: WebsiteScopeSchema, enabled: z.boolean(), order: z.number(),
}
export const WebsiteSchema = WebsiteScopeSchema.check(z.refine(scope => {
  const patterns = getDomainPatterns(scope)
  return patterns.length > 0 && patterns.every(isValidDomainPattern)
}, {
  message: 'Add a website domain like localhost:4200, *.example.com, or *.',
}))
export const requiredName = (label: string) => z.string().check(z.refine(value => Boolean(value.trim()), {
  message: `${label} is required.`,
}))
