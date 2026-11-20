import * as z from 'zod/mini'
import { EntryShape, HeaderPairSchema, isBlank, PersistedWebsiteScopeSchema, PlainHeaderPairSchema, PlainWebsiteScopeSchema, requiredName, RuleIdSchema, WebsiteSchema } from './schema-fields.ts'
import { displayText, hasTokens, isStoredTemplate, normalizeStoredTemplate, TemplateTextSchema } from './templates.ts'
import { requestUrlKey } from './network-matching.ts'

export const NETWORK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'] as const
export const NetworkMethodSchema = z.enum(NETWORK_METHODS)
const ModeSchema = z.enum(['bypass', 'call-server'])
/** Returns the problem with a concrete response header, or an empty string. */
export function responseHeaderProblem(key: string, value: string): string {
  if (!key || !/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || /[\r\n\0]/.test(value)) return 'Each response header needs a valid name and a value without line breaks.'
  if (/^(set-cookie|set-cookie2)$/i.test(key)) return 'Mock headers cannot set browser cookies. Remove Set-Cookie.'
  try { new Headers([[key, value]]) } catch { return 'Response headers contain an invalid value.' }
  return ''
}
// A pair holding a variable is checked once its value is filled in.
const ResponseHeadersSchema = z.array(HeaderPairSchema).check(z.superRefine((headers, context) => {
  headers.forEach((header, index) => {
    if (isBlank(header.key) && isBlank(header.value)) return
    if (hasTokens(header.key) || hasTokens(header.value)) {
      if (isBlank(header.key)) context.addIssue({ code: 'custom', path: [index, 'key'], message: 'Each response header needs a valid name and a value without line breaks.' })
      return
    }
    const message = responseHeaderProblem(displayText(header.key).trim(), displayText(header.value).trim())
    if (message) context.addIssue({ code: 'custom', path: [index, 'key'], message })
  })
}))
const ResponseShape = {
  requestUrl: TemplateTextSchema, method: NetworkMethodSchema, mode: ModeSchema,
  body: TemplateTextSchema, status: z.number(), headers: z.array(HeaderPairSchema),
}
// Keep invalid stored numeric statuses representable while disabled. Draft
// validation below still prevents activation or saving an invalid status.
const StoredStatusSchema = z.custom<number>(value => typeof value === 'number')
export const NetworkRuleSchema = z.object({ ...EntryShape, ...ResponseShape, status: StoredStatusSchema })
export const NetworkRuleDraftSchema = z.object({
  ...ResponseShape, name: requiredName('Network rule name'), url: WebsiteSchema, enabled: z.boolean(),
  requestUrl: TemplateTextSchema.check(z.refine(value => hasTokens(value) ? !isBlank(value) : requestUrlKey(value) !== null, { message: 'Enter a complete HTTP or HTTPS request URL.' })),
  status: z.number().check(z.refine(value => Number.isInteger(value) && value >= 200 && value <= 599, { message: 'Use a status code from 200 to 599.' })),
  headers: ResponseHeadersSchema,
})
export const PersistedNetworkRuleSchema = z.object({
  id: RuleIdSchema,
  name: z.catch(z.string(), ''), url: PersistedWebsiteScopeSchema,
  requestUrl: z.pipe(z.unknown(), z.transform(value => normalizeStoredTemplate(value))), method: z.catch(NetworkMethodSchema, 'GET'),
  enabled: z.catch(z.boolean(), true), order: z.catch(z.optional(z.number()), undefined),
  mode: z.catch(ModeSchema, 'bypass'), body: z.pipe(z.unknown(), z.transform(value => normalizeStoredTemplate(value))),
  status: z.catch(StoredStatusSchema, 200),
  headers: z.pipe(z.catch(z.array(z.unknown()), []), z.transform(values => values.flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const { key, value: headerValue } = value as Record<string, unknown>
    return isStoredTemplate(key) && isStoredTemplate(headerValue) ? [{ key: normalizeStoredTemplate(key), value: normalizeStoredTemplate(headerValue) }] : []
  }))),
})

/** A Network Rule with variables filled in, as pages receive it. `display` shows its templates for execution history. */
export const ResolvedNetworkRuleSchema = z.object({
  id: RuleIdSchema, name: z.string(), url: PlainWebsiteScopeSchema, enabled: z.boolean(), order: z.number(),
  requestUrl: z.string(), method: NetworkMethodSchema, mode: ModeSchema, body: z.string(), status: StoredStatusSchema,
  headers: z.array(PlainHeaderPairSchema),
  display: z.optional(z.object({ url: PlainWebsiteScopeSchema, requestUrl: z.string(), body: z.string(), headers: z.array(PlainHeaderPairSchema) })),
})
