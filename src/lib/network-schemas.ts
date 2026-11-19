import * as z from 'zod/mini'
import { EntryShape, HeaderPairSchema, isBlank, PersistedHeaderPairSchema, PersistedTemplateSchema, PersistedWebsiteScopeSchema, requiredName, RuleIdSchema, WebsiteSchema } from './schema-fields.ts'
import { requestUrlKey } from './network-matching.ts'
import { displayText, hasReferences, TemplateTextSchema, trimTemplateEdges } from './templates.ts'

export const NETWORK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'] as const
export const NetworkMethodSchema = z.enum(NETWORK_METHODS)
export const ModeSchema = z.enum(['bypass', 'call-server'])

/** Today's response-header checks for one concrete pair. Returns '' when valid or when both parts are empty. */
export function responseHeaderProblem(key: string, value: string, trim = true): string {
  if (trim) { key = key.trim(); value = value.trim() }
  if (!key && !value) return ''
  if (!key || !/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || /[\r\n\0]/.test(value)) return 'Each response header needs a valid name and a value without line breaks.'
  if (/^(set-cookie|set-cookie2)$/i.test(key)) return 'Mock headers cannot set browser cookies. Remove Set-Cookie.'
  try { new Headers([[key, value]]) } catch { return 'Response headers contain an invalid value.' }
  return ''
}

// Parts containing references are checked only for presence; their values are checked when filled in.
const ResponseHeadersSchema = z.array(HeaderPairSchema).check(z.superRefine((headers, context) => {
  headers.forEach((header, index) => {
    const keyRefs = hasReferences(header.key), valueRefs = hasReferences(header.value)
    let message = ''
    if (!keyRefs && !valueRefs) message = responseHeaderProblem(displayText(header.key), displayText(header.value))
    else if (isBlank(header.key)) message = 'Each response header needs a valid name and a value without line breaks.'
    else if (!keyRefs) message = responseHeaderProblem(displayText(header.key), 'x')
    else if (!valueRefs && /[\r\n\0]/.test(displayText(header.value))) message = 'Each response header needs a valid name and a value without line breaks.'
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
  requestUrl: TemplateTextSchema.check(z.refine(value => hasReferences(value) ? !isBlank(value) : requestUrlKey(displayText(value)) !== null, { message: 'Enter a complete HTTP or HTTPS request URL.' })),
  status: z.number().check(z.refine(value => Number.isInteger(value) && value >= 200 && value <= 599, { message: 'Use a status code from 200 to 599.' })),
  headers: ResponseHeadersSchema,
})
export const PersistedNetworkRuleSchema = z.object({
  id: RuleIdSchema,
  name: PersistedTemplateSchema, url: PersistedWebsiteScopeSchema,
  requestUrl: PersistedTemplateSchema, method: z.catch(NetworkMethodSchema, 'GET'),
  enabled: z.catch(z.boolean(), true), order: z.catch(z.optional(z.number()), undefined),
  mode: z.catch(ModeSchema, 'bypass'), body: PersistedTemplateSchema,
  status: z.catch(StoredStatusSchema, 200),
  headers: z.pipe(z.catch(z.array(z.unknown()), []), z.transform(values => values.flatMap(value => {
    const result = PersistedHeaderPairSchema.safeParse(value)
    return result.success ? [{ key: trimTemplateEdges(result.data.key), value: trimTemplateEdges(result.data.value) }] : []
  }))),
})
