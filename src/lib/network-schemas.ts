import * as z from 'zod/mini'
import { EntryShape, HeaderPairSchema, requiredName, WebsiteSchema } from './schema-fields.ts'
import { requestUrlKey } from './network-matching.ts'

export const NETWORK_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'ANY'] as const
export const NetworkMethodSchema = z.enum(NETWORK_METHODS)
const ModeSchema = z.enum(['bypass', 'call-server'])
const ResponseHeadersSchema = z.array(HeaderPairSchema).check(z.superRefine((headers, context) => {
  headers.forEach((header, index) => {
    const key = header.key.trim(), value = header.value.trim()
    if (!key && !value) return
    let message = ''
    if (!key || !/^[!#$%&'*+.^_`|~\w-]+$/.test(key) || /[\r\n\0]/.test(value)) message = 'Each response header needs a valid name and a value without line breaks.'
    else if (/^(set-cookie|set-cookie2)$/i.test(key)) message = 'Mock headers cannot set browser cookies. Remove Set-Cookie.'
    else { try { new Headers([[key, value]]) } catch { message = 'Response headers contain an invalid value.' } }
    if (message) context.addIssue({ code: 'custom', path: [index, 'key'], message })
  })
}))
const ResponseShape = {
  requestUrl: z.string(), method: NetworkMethodSchema, mode: ModeSchema,
  body: z.string(), status: z.number(), headers: z.array(HeaderPairSchema),
}
// Keep invalid stored numeric statuses representable while disabled. Draft
// validation below still prevents activation or saving an invalid status.
const StoredStatusSchema = z.custom<number>(value => typeof value === 'number')
export const NetworkOverrideSchema = z.object({ ...EntryShape, ...ResponseShape, status: StoredStatusSchema })
export const NetworkOverrideDraftSchema = z.object({
  ...ResponseShape, name: requiredName('Network rule name'), url: WebsiteSchema, enabled: z.boolean(),
  requestUrl: z.string().check(z.refine(value => requestUrlKey(value) !== null, { message: 'Enter a complete HTTP or HTTPS request URL.' })),
  status: z.number().check(z.refine(value => Number.isInteger(value) && value >= 200 && value <= 599, { message: 'Use a status code from 200 to 599.' })),
  headers: ResponseHeadersSchema,
})
export const PersistedNetworkOverrideSchema = z.object({
  id: z.catch(z.string().check(z.minLength(1)), () => crypto.randomUUID()),
  name: z.catch(z.string(), ''), url: z.catch(z.string(), '*'),
  requestUrl: z.catch(z.string(), ''), method: z.catch(NetworkMethodSchema, 'GET'),
  enabled: z.catch(z.boolean(), true), order: z.catch(z.optional(z.number()), undefined),
  mode: z.catch(ModeSchema, 'bypass'), body: z.catch(z.string(), ''),
  status: z.catch(StoredStatusSchema, 200),
  headers: z.pipe(z.catch(z.array(z.unknown()), []), z.transform(values => values.flatMap(value => {
    const result = HeaderPairSchema.safeParse(value)
    return result.success ? [result.data] : []
  }))),
})
